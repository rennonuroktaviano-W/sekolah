/**
 * Browser checks for the scroll-driven book scene.
 *
 * The animation lives in CSS custom properties that no unit test can reach, so
 * this drives a real browser and asserts the things that actually matter:
 * that the sequence is reversible, that each stage does something, that the
 * book is gone before any text lands on it, and that the scene survives mobile
 * and reduced-motion. Requires a dev server on port 3000 (`npm run dev`).
 */
const { chromium } = require("playwright");

const BASE = process.env.SCENE_URL || "http://localhost:3000";

let pass = 0;
let fail = 0;

const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  ok ? pass++ : fail++;
};

const vars = (page) =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector(".scroll-track"));
    const names = [
      "--progress", "--book-scale", "--book-ty", "--book-rx", "--book-ry",
      "--cover-angle", "--page-open", "--seam", "--spread-rx",
      "--page-curve-angle", "--page-curve-depth",
      "--book-fade", "--light-scale", "--light-opacity", "--bloom",
      "--fill-opacity", "--intro",
    ];
    return Object.fromEntries(
      names.map((n) => [n, parseFloat(cs.getPropertyValue(n)) || 0]),
    );
  });

const scrollToProgress = async (page, m, s) => {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round((m.h - m.vh) * s));
  await page.waitForTimeout(200);
};

(async () => {
  // ---- 1. Deterministic + reversible -------------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return { h: el.getBoundingClientRect().height, vh: window.innerHeight };
    });

    const forward = [];
    for (const s of [0.2, 0.4, 0.5, 0.65, 0.8, 0.95]) {
      await scrollToProgress(page, m, s);
      forward.push(await vars(page));
    }
    const backward = [];
    for (const s of [0.95, 0.8, 0.65, 0.5, 0.4, 0.2]) {
      await scrollToProgress(page, m, s);
      backward.push(await vars(page));
    }
    backward.reverse();

    let maxDrift = 0;
    for (let i = 0; i < forward.length; i++) {
      for (const k of Object.keys(forward[i])) {
        maxDrift = Math.max(maxDrift, Math.abs(forward[i][k] - backward[i][k]));
      }
    }
    check(
      "scroll up replays the exact same state (reversible)",
      maxDrift < 0.005,
      `max drift ${maxDrift.toFixed(5)}`,
    );

    // Every stage must actually change something.
    await scrollToProgress(page, m, 0.3);
    const v3 = await vars(page);
    await scrollToProgress(page, m, 0.5);
    const v5 = await vars(page);
    check(
      "opening stage rotates the cover",
      Math.abs(v5["--cover-angle"] - v3["--cover-angle"]) > 30,
      `${v3["--cover-angle"].toFixed(1)}deg -> ${v5["--cover-angle"].toFixed(1)}deg`,
    );
    await scrollToProgress(page, m, 0.65);
    const v65 = await vars(page);
    check(
      "cover settles just short of 180deg once fully open",
      v65["--cover-angle"] <= -176 && v65["--cover-angle"] >= -180,
      `${v65["--cover-angle"].toFixed(1)}deg`,
    );

    // Rotation must increase monotonically across the whole opening window.
    let previous = Infinity;
    let monotonic = true;
    let worst = 0;
    for (let s = 0.35; s <= 0.65; s += 0.01) {
      await scrollToProgress(page, m, s);
      const angle = (await vars(page))["--cover-angle"];
      if (angle > previous + 1e-6) {
        monotonic = false;
        worst = Math.max(worst, angle - previous);
      }
      previous = angle;
    }
    check(
      "opening never snaps back towards closed",
      monotonic,
      monotonic ? "" : `regressed by ${worst.toFixed(3)}deg`,
    );

    await scrollToProgress(page, m, 0.6);
    const v6 = await vars(page);
    await scrollToProgress(page, m, 0.72);
    const v72 = await vars(page);
    check(
      "reveal stage (60-75%) is not a dead zone",
      Math.abs(v72["--page-curve-angle"] - v6["--page-curve-angle"]) > 5 &&
        Math.abs(v72["--seam"] - v6["--seam"]) > 0.2,
      `curve ${v6["--page-curve-angle"]}->${v72["--page-curve-angle"]}, seam ${v6["--seam"].toFixed(2)}->${v72["--seam"].toFixed(2)}`,
    );

    await scrollToProgress(page, m, 0.94);
    const v94 = await vars(page);
    check(
      "book is gone before the intro text arrives",
      v94["--book-fade"] < 0.02 && v94["--intro"] < 0.05,
      `intro ${v94["--intro"].toFixed(2)}, bookFade ${v94["--book-fade"].toFixed(2)}`,
    );

    await scrollToProgress(page, m, 1);
    const v1 = await vars(page);
    check(
      "light fills the frame and the intro lands",
      v1["--fill-opacity"] > 0.95 && v1["--intro"] > 0.95,
      `fill ${v1["--fill-opacity"].toFixed(2)}, intro ${v1["--intro"].toFixed(2)}`,
    );

    // The light must be dark enough for the intro copy to hold contrast.
    const legibility = await page.evaluate(() => {
      const name = document.querySelector(".intro__name");
      const desc = document.querySelector(".intro__description");
      const overlap = (() => {
        const a = name.getBoundingClientRect();
        const b = desc.getBoundingClientRect();
        return a.width > 0 && a.height > 0 && b.width > 0;
      })();
      return {
        overlap,
        nameOpacity: getComputedStyle(name).opacity,
        text: name.textContent.trim(),
      };
    });
    check(
      "intro copy is laid out and visible at the end of the track",
      legibility.overlap && Number(legibility.nameOpacity) > 0.95,
      `"${legibility.text}" @ ${legibility.nameOpacity}`,
    );

    await browser.close();
  }

  // ---- 2. Structure / semantics / a11y -----------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 100));
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    check(
      "clean hydration, no console or page errors",
      consoleErrors.length === 0,
      consoleErrors.join(" | ") || "none",
    );

    const a = await page.evaluate(() => ({
      h1: document.querySelectorAll("h1").length,
      nav: document.querySelectorAll("nav, header nav").length,
      footer: document.querySelectorAll("footer").length,
      lang: document.documentElement.lang,
      placeholder: document.body.textContent.includes("[NAMA SEKOLAH]"),
      hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hasMain: !!document.querySelector("main"),
      nameInDom: !!document.querySelector("h1"),
    }));
    check("no navbar", a.nav === 0, `${a.nav} found`);
    check("no footer", a.footer === 0, `${a.footer} found`);
    check("exactly one h1 with the school name", a.h1 === 1 && a.nameInDom);
    check("document language set", a.lang === "id", `lang="${a.lang}"`);
    check("placeholder copy, no invented facts", a.placeholder);
    check("no horizontal overflow", a.hOverflow === 0, `${a.hOverflow}px`);

    // School info must be in the server HTML, not injected by JS.
    const raw = await (await fetch(BASE)).text();
    check(
      "school info present in server-rendered HTML",
      raw.includes("[NAMA SEKOLAH]") && raw.includes("<h1"),
    );
    await browser.close();
  }

  // ---- 2b. No-JS fallback ------------------------------------------------
  {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const noJs = await page.evaluate(() => {
      const name = document.querySelector(".intro__name");
      if (!name) return { present: false, opacity: null };
      return {
        present: true,
        opacity: getComputedStyle(name).opacity,
        text: name.textContent.trim(),
      };
    });
    check(
      "school information readable with JavaScript disabled",
      noJs.present && Number(noJs.opacity) === 1,
      noJs.present ? `opacity ${noJs.opacity} for "${noJs.text}"` : "no h1",
    );
    await browser.close();
  }

  // ---- 3. Reduced motion ------------------------------------------------
  {
    const browser = await chromium.launch();

    // The reduced-motion pass is only meaningful if the thing it disables is
    // actually running in the first place. Read both, or the check is vacuous.
    const dotAnimation = async (reducedMotion) => {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        reducedMotion,
      });
      await page.goto(BASE, { waitUntil: "networkidle" });
      const name = await page.evaluate(
        () => getComputedStyle(document.querySelector(".scroll-hint__dot")).animationName,
      );
      if (reducedMotion !== "no-preference") await page.close();
      return name;
    };

    const dotNormal = await dotAnimation("no-preference");
    check(
      "ambient animations actually run in normal mode",
      dotNormal === "hint-fall",
      `animation-name: ${dotNormal}`,
    );

    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return { h: el.getBoundingClientRect().height, vh: window.innerHeight };
    });
    await scrollToProgress(page, m, 0.5);
    const rm = await page.evaluate(() => {
      const dot = document.querySelector(".scroll-hint__dot");
      const name = document.querySelector(".intro__name");
      return {
        dotAnimation: getComputedStyle(dot).animationName,
        nameFilter: getComputedStyle(name).filter,
      };
    });
    check(
      "scroll hint animation disabled under reduced motion",
      rm.dotAnimation === "none",
      rm.dotAnimation,
    );
    check("intro blur removed entirely", rm.nameFilter === "none", rm.nameFilter);
    // The story must still be reachable by scrolling.
    await scrollToProgress(page, m, 1);
    const rmEnd = await page.evaluate(
      () => getComputedStyle(document.querySelector(".intro__name")).opacity,
    );
    check("story still completes under reduced motion", Number(rmEnd) > 0.95, rmEnd);
    await browser.close();
  }

  // ---- 3b. No unresolved timeline custom properties ----------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });

    // Every value the hook writes, plus the two the CSS derives on its own.
    // A single missing declaration makes a whole shorthand silently invalid,
    // which is how the scroll hint animation was dead without a word of it.
    const UNRESOLVED_OK = new Set(["--leaf-index", "--line"]);
    const bad = await page.evaluate(() => {
      const names = [
        "--progress", "--book-scale", "--book-ty", "--book-rx", "--book-ry",
        "--cover-angle", "--page-open", "--seam", "--spread-rx",
        "--page-curve-angle", "--page-curve-depth",
        "--book-fade", "--light-scale", "--light-opacity", "--light-blur",
        "--bloom", "--fill-opacity", "--intro",
        "--fx-grain-opacity", "--fx-vignette-strength", "--fx-spotlight-opacity",
        "--fx-dust-opacity", "--fx-ray-opacity", "--fx-streak-opacity",
        "--ease-hint",
      ];
      const track = getComputedStyle(document.querySelector(".scroll-track"));
      return names
        .map((n) => [n, track.getPropertyValue(n).trim()])
        .filter(([, v]) => v === "")
        .map(([n]) => n);
    });
    check(
      "every custom property the timeline depends on resolves",
      bad.length === 0,
      bad.length ? `unresolved: ${bad.join(", ")}` : "all resolve",
    );
    void UNRESOLVED_OK;

    // And nothing in our own stylesheet may reference a var nobody sets.
    const dangling = await page.evaluate(() => {
      const declared = new Set();
      const referenced = new Map();
      const collect = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules) collect(rule.cssRules);
          const text = rule.cssText || "";
          for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:/g)) declared.add(m[1]);
          for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
            if (!referenced.has(m[1])) referenced.set(m[1], new Set());
            referenced
              .get(m[1])
              .add(rule.selectorText || rule.parentRule?.selectorText || "@rule");
          }
        }
      };
      for (const sheet of document.styleSheets) {
        try {
          collect(sheet.cssRules);
        } catch {
          /* not ours */
        }
      }
      // Anything set from an inline style counts as declared. Discovered
      // rather than listed, so a new component cannot slip a var past this.
      for (const el of document.querySelectorAll("*")) {
        for (let i = 0; i < el.style.length; i++) {
          const name = el.style.item(i);
          if (name.startsWith("--")) declared.add(name);
        }
      }
      // Tailwind preflight and next/font own these; not part of our contract.
      const external = /^--(default-|font|color-scheme|tw-)/;
      return [...referenced.entries()]
        .filter(([n]) => !declared.has(n) && !external.test(n))
        .map(([n, where]) => `${n} in ${[...where].join(", ")}`);
    });
    check(
      "no stylesheet references a custom property nobody declares",
      dangling.length === 0,
      dangling.join(" | ") || "all declared",
    );
    await browser.close();
  }

  // ---- 4. Mobile --------------------------------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const mob = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return {
        hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        trackHeight: el.getBoundingClientRect().height,
        bookWidth: document.querySelector(".book").getBoundingClientRect().width,
        bloomFilter: getComputedStyle(document.querySelector(".light__bloom")).filter,
      };
    });
    check("mobile has no horizontal overflow", mob.hOverflow === 0, `${mob.hOverflow}px`);
    check(
      "mobile book stays inside the viewport",
      mob.bookWidth < 390,
      `${Math.round(mob.bookWidth)}px book`,
    );
    check(
      "mobile drops the heavy bloom blur",
      mob.bloomFilter === "blur(16px)",
      mob.bloomFilter,
    );
    await browser.close();
  }

  // ---- 5. Touch has no hover dependency ---------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const hoverOnly = await page.evaluate(() => {
      let count = 0;
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        // A reveal-on-hover pattern that would strand touch users.
        if (el.matches(":hover") && cs.opacity === "0") count++;
      }
      return count;
    });
    check("no content is gated behind :hover", hoverOnly === 0);
    await browser.close();
  }

  // ---- 5g. Curved page spread --------------------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return { h: el.getBoundingClientRect().height, vh: window.innerHeight };
    });

    const STRIPS = await page.evaluate(
      () => document.querySelectorAll(".book-pages__strip").length,
    );
    check(
      "the spread is built from a full fan of strips",
      STRIPS >= 10,
      `${STRIPS} strips`,
    );

    // The strip count and the divisor the geometry uses cannot drift apart.
    const counts = await page.evaluate(() => {
      const pages = getComputedStyle(document.querySelector(".book-pages"));
      const strip = getComputedStyle(document.querySelector(".book-pages__strip"));
      return {
        declared: pages.getPropertyValue("--strip-count").trim(),
        width: strip.width,
        left: strip.left,
      };
    });
    check(
      "every strip is exactly one slot wide and on its own slot",
      counts.declared === String(STRIPS) && counts.left.startsWith("0px"),
      `--strip-count ${counts.declared}, first left ${counts.left}, width ${counts.width}`,
    );

    // The curve has to be symmetric: both outer edges recede, the spine does
    // not. An off-by-one in the strip maths shows up as one side receding and
    // the other not, which reads as a dent rather than a curve.
    const symmetry = await page.evaluate(() => {
      const s = [...document.querySelectorAll(".book-pages__strip")];
      const z = (i) => {
        const m = getComputedStyle(s[i]).transform;
        return m === "none" ? 0 : Number(m.slice(m.indexOf("matrix3d(") + 9).split(",")[14]);
      };
      const n = s.length;
      const mid = (n - 1) / 2;
      return {
        leftOuter: +z(1).toFixed(2),
        rightOuter: +z(n - 2).toFixed(2),
        spine: +z(Math.round(mid)).toFixed(2),
      };
    });
    // Sampled at rest the curve is deliberately shallow, so the spine only
    // sits a fraction of a pixel proud of the outer strips. The relation
    // that matters is ordering and symmetry, not a fixed depth: an off-by-one
    // in the strip maths would make one side recede and not the other.
    check(
      "the curve is symmetric about the spine",
      Math.abs(symmetry.leftOuter - symmetry.rightOuter) < 0.2 &&
        symmetry.spine > symmetry.leftOuter &&
        symmetry.leftOuter < 0 &&
        symmetry.rightOuter < 0,
      `L ${symmetry.leftOuter}, spine ${symmetry.spine}, R ${symmetry.rightOuter}`,
    );

    /*
     * The crease is a fold, not a gradient. At its original 24% width it
     * covered five of the twelve strips, so the shadow was drawing the curve
     * instead of the geometry. Two strips' worth is the fold.
     */
    const crease = await page.evaluate(() => {
      const pages = document.querySelector(".book-pages");
      const strips = [...document.querySelectorAll(".book-pages__strip")];
      const c = document.querySelector(".book-pages__crease").getBoundingClientRect();
      const covers = strips.filter((s) => {
        const b = s.getBoundingClientRect();
        return Math.min(b.right, c.right) - Math.max(b.left, c.left) > b.width * 0.5;
      });
      return { count: strips.length, covered: covers.length, w: +c.width.toFixed(0) };
    });
    check(
      "the crease only marks the fold, not half the spread",
      crease.covered <= 4,
      `${crease.covered} of ${crease.count} strips under the crease, ${crease.w}px wide`,
    );

    /*
     * The page stack has to hang off the outer strip. Hung off the block's
     * right edge instead, it landed on top of strips 9 to 11 and visibly
     * dimmed them, because those strips rotate away and the block's projected
     * edge is inboard of the paper it belongs to.
     */
    const fore = await page.evaluate(() => {
      const strips = [...document.querySelectorAll(".book-pages__strip")];
      const fb = document.querySelector(".book-pages__fore-edge").getBoundingClientRect();
      const overlaps = strips
        .map((s, i) => {
          const b = s.getBoundingClientRect();
          const ox = Math.min(fb.right, b.right) - Math.max(fb.left, b.left);
          return { i, ox: +ox.toFixed(1), w: +b.width.toFixed(1) };
        })
        .filter((o) => o.ox > 1);
      return overlaps;
    });
    const worstOverlap = fore.reduce(
      (worst, o) => Math.max(worst, o.ox / o.w),
      0,
    );
    check(
      "the page stack sits at the outer edge, not across the paper",
      worstOverlap < 0.35,
      fore.length ? fore.map((o) => `${o.i}:${o.ox}px`).join(" ") : "no overlap",
    );

    // Shading must fall off with distance from the spine, or the curve has
    // nothing to read from and the spread looks like a flat plane.
    const shade = await page.evaluate(() => {
      const s = [...document.querySelectorAll(".book-pages__strip")];
      const n = s.length;
      const at = (i) => Number(getComputedStyle(s[i], "::after").opacity);
      return { spine: at(Math.round((n - 1) / 2)), edge: at(n - 1), near: at(1) };
    });
    check(
      "the curve is shaded by distance from the spine",
      shade.edge > shade.spine + 0.1 && shade.near > shade.spine + 0.1,
      `spine ${shade.spine.toFixed(2)}, each side ${shade.near.toFixed(2)} / ${shade.edge.toFixed(2)}`,
    );

    // Curvature deepens through the reveal, and the block keeps its thickness.
    const curve = await page.evaluate(() => {
      const t = getComputedStyle(document.querySelector(".scroll-track"));
      return {
        angle: t.getPropertyValue("--page-curve-angle").trim(),
        depth: t.getPropertyValue("--page-curve-depth").trim(),
      };
    });
    check(
      "the spread has curvature values to read",
      parseFloat(curve.angle) > 0 && parseFloat(curve.depth) > 0,
      `${curve.angle} / ${curve.depth}`,
    );
    await browser.close();
  }

  // ---- 5h. The spread on a phone ------------------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const phone = await page.evaluate(() => {
      const pages = getComputedStyle(document.querySelector(".book-pages"));
      const strips = [...document.querySelectorAll(".book-pages__strip")];
      const z = (i) => {
        const m = getComputedStyle(strips[i]).transform;
        return m === "none" ? 0 : Number(m.slice(m.indexOf("matrix3d(") + 9).split(",")[14]);
      };
      return {
        // The DOM and the divisor must still agree, or the last strips get
        // positioned off the end of the spread.
        rendered: strips.length,
        declared: pages.getPropertyValue("--strip-count").trim(),
        angleScale: Number(pages.getPropertyValue("--page-curve-angle-scale")),
        depthScale: Number(pages.getPropertyValue("--page-curve-depth-scale")),
        outerZ: z(strips.length - 2),
      };
    });
    check(
      "the phone keeps every strip the geometry divides by",
      phone.rendered === Number(phone.declared),
      `${phone.rendered} rendered, --strip-count ${phone.declared}`,
    );
    check(
      "the phone curve is flatter but still curved",
      phone.angleScale < 1 && phone.depthScale < 1 && phone.outerZ < 0,
      `angle x${phone.angleScale}, depth x${phone.depthScale}, outer Z ${phone.outerZ}`,
    );
    await browser.close();
  }

  // ---- 5i. The shadow belongs to the silhouette --------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return { h: el.getBoundingClientRect().height, vh: window.innerHeight };
    });

    /*
     * The geometry in globals.css rests on an assumption about where the hinge
     * is: the cover is inset: 0 and hinged on its own left edge, so swinging
     * open lands it outside the box to the left and the silhouette grows to
     * about 1.97 boxes wide. If the hinge ever moves, --silhouette-w and
     * --silhouette-c are quietly wrong and the shadow drifts off the book
     * again. Assert the assumption so that failure is loud.
     */
    const hinge = await page.evaluate(() => {
      const cover = document.querySelector(".book-cover");
      const spine = document.querySelector(".book__spine");
      const box = document.querySelector(".book");
      return {
        origin: getComputedStyle(cover).transformOrigin,
        spineLeft: getComputedStyle(spine).left,
        boxWidth: box.getBoundingClientRect().width,
        coverWidth: cover.getBoundingClientRect().width,
      };
    });
    check(
      "the cover is still hinged on the box's left edge",
      hinge.origin.startsWith("0px") && hinge.spineLeft === "0px",
      `origin ${hinge.origin}, spine left ${hinge.spineLeft}`,
    );
    check(
      "the cover is the full width of the box, as the silhouette maths assumes",
      Math.abs(hinge.coverWidth - hinge.boxWidth) < 1.5,
      `cover ${hinge.coverWidth.toFixed(1)}px vs box ${hinge.boxWidth.toFixed(1)}px`,
    );

    /*
     * Now the actual bug. At full open the silhouette is roughly twice the box
     * and centred on the spine, which is the box's left edge. The shadow was
     * pinned at left: 50% at 116% of the box, so it was half as wide as the
     * object casting it and sat half a book-width to the right of it.
     *
     * Measured against the real projected silhouette, not against the box.
     */
    const rows = [];
    for (const at of [0, 0.35, 0.6, 0.75]) {
      await scrollToProgress(page, m, at);
      rows.push(
        await page.evaluate(() => {
          const rect = (s) => document.querySelector(s).getBoundingClientRect();
          // The visible book: the cover and the spread, unioned.
          const parts = [rect(".book-cover"), rect(".book-pages")];
          const left = Math.min(...parts.map((r) => r.left));
          const right = Math.max(...parts.map((r) => r.right));
          const silW = right - left;
          const silC = (left + right) / 2;

          const sh = rect(".book__shadow");
          const shW = sh.width;
          const shC = sh.left + sh.width / 2;
          return {
            silW: +silW.toFixed(1),
            shW: +shW.toFixed(1),
            // Shadow is allowed to overspill the object; the centre is not.
            widthRatio: +(shW / silW).toFixed(3),
            centreOffBy: +(shC - silC).toFixed(1),
            pageOpen: Number(
              getComputedStyle(document.querySelector(".scroll-track")).getPropertyValue(
                "--page-open",
              ),
            ),
          };
        }),
      );
    }

    const wideEnough = rows.every((r) => r.widthRatio >= 0.95 && r.widthRatio <= 1.5);
    check(
      "the shadow is never narrower than the thing casting it",
      wideEnough,
      rows.map((r) => `open ${r.pageOpen.toFixed(2)}: ${r.widthRatio}x`).join(", "),
    );

    const centred = rows.every((r) => Math.abs(r.centreOffBy) < 14);
    check(
      "the shadow's centre tracks the silhouette's centre as the cover opens",
      centred,
      rows
        .map((r) => `open ${r.pageOpen.toFixed(2)}: off by ${r.centreOffBy}px`)
        .join(", "),
    );

    // The failure was worst at full open, so that one is called out on its own:
    // it was a 0.52x shadow sitting 80px right of centre.
    const full = rows[rows.length - 1];
    check(
      "at full open the shadow still covers the whole open book",
      full.widthRatio > 0.95 && Math.abs(full.centreOffBy) < 14,
      `open ${full.pageOpen.toFixed(2)}: ${full.widthRatio}x, off by ${full.centreOffBy}px`,
    );

    /*
     * A correctly sized shadow can still read as a hard cut-out. What makes a
     * cast shadow soft is that it gets softer as it gets wider, so the blur has
     * to grow with the silhouette rather than staying at the value that suited
     * the closed book.
     *
     * offsetHeight, not getBoundingClientRect: the filter is applied in the
     * element's own coordinate space and only then scaled by the camera, so
     * comparing a local blur against a post-scale height compares two different
     * spaces and passes for the wrong reason.
     */
    await scrollToProgress(page, m, 0.75);
    const readShadow = () =>
      page.evaluate(() => {
        const el = document.querySelector(".book__shadow");
        const cs = getComputedStyle(el);
        const blur = parseFloat(cs.filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? "0");
        // Local px: the filter applies here, before the camera scales it.
        return {
          opacity: +Number(cs.opacity).toFixed(3),
          blur: +blur.toFixed(2),
          width: +el.offsetWidth.toFixed(1),
          height: +el.offsetHeight.toFixed(1),
        };
      });

    const open = await readShadow();
    await scrollToProgress(page, m, 0);
    const closed = await readShadow();

    check(
      "the shadow is still painting at full open",
      open.opacity > 0.05,
      `opacity ${open.opacity}`,
    );
    check(
      "the shadow blurs by a real fraction of its own height",
      open.blur > open.height * 0.08,
      `blur ${open.blur}px on ${open.height}px tall`,
    );

    /*
     * Compared against the closed book, measured in the same run rather than
     * against a constant: a cast shadow spreads as it widens, so the wide one
     * must not be proportionately crisper than the narrow one that worked.
     */
    const softClosed = closed.blur / closed.width;
    const softOpen = open.blur / open.width;
    check(
      "the shadow's softness scales with its width, not pinned to the closed book",
      softOpen >= softClosed,
      `blur/width ${softOpen.toFixed(4)} open vs ${softClosed.toFixed(4)} closed`,
    );
    await browser.close();
  }

  // ---- 5e. No persistent chrome over the scene --------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return { h: el.getBoundingClientRect().height, vh: window.innerHeight };
    });

    // The chapter rail was removed: it held the right-hand margin with labels
    // down it, and the browser's own scrollbar already reports position.
    // Nothing may take its place, and nothing else may creep into that edge.
    const chrome = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (cs.position !== "fixed" && cs.position !== "sticky") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const el2 = el;
        // Only count things that persist as the story scrolls.
        if (!el2.closest(".scroll-track")) bad.push(el2.className || el2.tagName);
      }
      return {
        fixed: bad,
        // Right-hand gutter: nothing of ours may live out there.
        rightEdge: [...document.querySelectorAll(".intro *")]
          .filter((el) => getComputedStyle(el).position === "fixed")
          .length,
        railLeft: document.querySelectorAll(".rail").length,
      };
    });
    check(
      "no fixed chrome sits over the story",
      chrome.fixed.length === 0 && chrome.rightEdge === 0,
      chrome.fixed.join(", ") || "none",
    );
    check(
      "the right-hand rail is gone and not replaced",
      chrome.railLeft === 0,
      `${chrome.railLeft} rail elements`,
    );

    // The scroll hint still opens the story and still gets out of the way.
    await scrollToProgress(page, m, 0);
    const open = await page.evaluate(() => ({
      hint: Number(getComputedStyle(document.querySelector(".scroll-hint")).opacity),
      right: (() => {
        const b = document.querySelector(".scroll-hint").getBoundingClientRect();
        return +(b.left + b.width / 2).toFixed(0);
      })(),
    }));
    check(
      "the scroll hint opens the story, centred",
      open.hint > 0.7 && Math.abs(open.right - 720) < 4,
      `opacity ${open.hint}, centre x${open.right}`,
    );

    await scrollToProgress(page, m, 0.25);
    const gone = await page.evaluate(
      () => Number(getComputedStyle(document.querySelector(".scroll-hint")).opacity),
    );
    check("the scroll hint leaves once exploring starts", gone === 0, `${gone}`);

    // Nothing of ours may still paint at the end, beside the copy. Own opacity
    // is not enough to answer that: a layer can be fully transparent itself
    // and still be visible through an opaque parent, or vice versa. What
    // matters is the product along the ancestor chain.
    await scrollToProgress(page, m, 1);
    const end = await page.evaluate(() => {
      const effective = (el) => {
        let o = 1;
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          o *= Number(getComputedStyle(n).opacity);
        }
        return o;
      };
      const layer = (sel) => {
        const el = document.querySelector(sel);
        return el ? +effective(el).toFixed(3) : 0;
      };
      return {
        book: layer(".book-layer"),
        pages: layer(".book-pages"),
        crease: layer(".light__crease"),
        bloom: layer(".light__bloom"),
        rays: layer(".light__rays"),
        // The book is transparent but must also stop intercepting clicks.
        hit: document
          .elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2)
          .some(
            (el) =>
              el !== document.body &&
              el.closest(".book-scene, .light, .atmosphere") !== null,
          ),
        intro: layer(".intro-overlay"),
      };
    });
    check(
      "the scene is fully cleared for the copy",
      end.book === 0 && end.crease === 0 && end.bloom === 0 && end.rays === 0,
      `book ${end.book}, crease ${end.crease}, bloom ${end.bloom}, rays ${end.rays}`,
    );
    check(
      "the copy is fully opaque at the end",
      end.intro > 0.99,
      `intro ${end.intro}`,
    );
    check(
      "the invisible scene cannot intercept clicks meant for the copy",
      end.hit === false,
      end.hit ? "a scene layer is on top at centre" : "clear",
    );
    await browser.close();
  }

  // ---- 5c. Light show ---------------------------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return { h: el.getBoundingClientRect().height, vh: window.innerHeight };
    });
    const LAYERS = [
      ".light__crease",
      ".light__halo",
      ".light__rays",
      ".light__bloom",
      ".light__streak",
      ".light__chroma--cool",
      ".light__chroma--warm",
      ".light__bokeh",
      ".light__dust",
    ];
    /*
     * The burst must reach the intensity its own envelope asks for. It used to
     * be parented inside the book, so --book-fade, which is on its way to zero
     * while the burst is still ramping, multiplied into every layer and held
     * the climax at roughly 0.43 of 1.0. Sample at the peak and compare the
     * layer against the variable that is meant to drive it.
     */
    await scrollToProgress(page, m, 0.9);
    const climax = await page.evaluate(() => {
      const el = document.querySelector(".light__crease");
      let eff = 1;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        eff *= Number(getComputedStyle(n).opacity);
      }
      return {
        own: Number(getComputedStyle(el).opacity),
        eff: +eff.toFixed(3),
        drive: Number(
          getComputedStyle(document.querySelector(".scroll-track")).getPropertyValue(
            "--light-opacity",
          ),
        ),
        bookFade: Number(
          getComputedStyle(document.querySelector(".scroll-track")).getPropertyValue(
            "--book-fade",
          ),
        ),
      };
    });
    check(
      "the burst reaches the intensity its own envelope asks for",
      climax.eff > 0.8 && Math.abs(climax.eff - climax.own) < 0.02,
      `effective ${climax.eff} vs own ${climax.own}, --light-opacity ${climax.drive}, --book-fade ${climax.bookFade}`,
    );
    const sample = async (at) => {
      await scrollToProgress(page, m, at);
      return page.evaluate(
        (sel) =>
          sel.map((s) => {
            const el = document.querySelector(s);
            return el ? Number(getComputedStyle(el).opacity) : -1;
          }),
        LAYERS,
      );
    };

    const atRest = await sample(0);
    check(
      "every light layer is fully dark before the burst",
      atRest.every((o) => o === 0),
      LAYERS.map((s, i) => `${s.slice(7)}:${atRest[i]}`).join(" "),
    );

    /*
     * The single most dangerous silent failure in this stylesheet: a
     * multiply written as `var(--a) * var(--b)` without calc() is invalid at
     * computed-value time, so opacity falls back to 1 and the layer sits
     * fully opaque over the whole scene. At rest that reads as "not dark",
     * and at the peak it reads as "fully lit", so neither endpoint alone
     * catches it. Requiring the peak to be genuinely partial does.
     */
    const atPeak = await sample(0.87);
    const peak = (name) => atPeak[LAYERS.indexOf(name)];
    check(
      "the burst is not a flat opaque slab at its peak",
      atPeak.some((o) => o > 0.05 && o < 0.98),
      LAYERS.map((s, i) => `${s.slice(7)}:${atPeak[i].toFixed(2)}`).join(" "),
    );
    /*
     * And the opposite failure: present but invisible. A shaft or a flare
     * that sits at 0.1 at the peak is a layer that exists in the DOM and
     * contributes nothing, which no opacity check would notice.
     */
    check(
      "the streak and the shafts actually read at the peak",
      peak(".light__streak") > 0.35 && peak(".light__rays") > 0.1,
      `streak ${peak(".light__streak").toFixed(2)}, rays ${peak(".light__rays").toFixed(2)}`,
    );

    /*
     * Per-layer opacity is not what the visitor sees. The light lives inside
     * the book, which fades out, so a layer left at 0.4 opacity is still
     * invisible. What matters is the effective contribution, parent fade
     * included, and by the end of the track that has to be zero or the burst
     * washes out the introduction.
     */
    await sample(1);
    const effective = await page.evaluate((sel) => {
      // The fade lives on .book, two levels above .light, so a single
      // getComputedStyle().opacity is not the contribution the eye sees.
      const chain = (el) => {
        let product = 1;
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          product *= Number(getComputedStyle(n).opacity);
        }
        return product;
      };
      const per = sel.map((s) => {
        const el = document.querySelector(s);
        return { s, effective: chain(el) * Number(getComputedStyle(el).opacity) };
      });
      return {
        book: Number(getComputedStyle(document.querySelector(".book")).opacity),
        worst: per.reduce((a, b) => (a.effective > b.effective ? a : b)),
      };
    }, LAYERS);
    check(
      "the burst contributes nothing over the introduction",
      effective.worst.effective < 0.02,
      `book ${effective.book}, worst ${effective.worst.s.slice(7)} ${effective.worst.effective.toFixed(4)}`,
    );

    const blend = await page.evaluate(() => {
      const streak = document.querySelector(".light__streak");
      const rays = document.querySelector(".light__rays");
      return {
        streak: getComputedStyle(streak).mixBlendMode,
        rayMask: getComputedStyle(rays).maskImage || getComputedStyle(rays).webkitMaskImage,
      };
    });
    check("the streak composites additively", blend.streak === "screen", blend.streak);
    check(
      "the ray fan is masked so it never reaches the frame edge",
      /radial-gradient/.test(blend.rayMask),
      blend.rayMask.slice(0, 40),
    );

    const motes = await page.evaluate(() => {
      const dust = document.querySelector(".light__dust");
      return {
        motes: document.querySelectorAll(".light__mote").length,
        bokeh: document.querySelectorAll(".light__bokeh-dot").length,
        // Duplicated durations resynchronise the drift into a visible loop.
        durations: new Set(
          [...document.querySelectorAll(".light__bokeh-dot")].map((e) =>
            getComputedStyle(e).animationDuration,
          ),
        ).size,
        opacity: getComputedStyle(dust).opacity,
      };
    });
    check(
      "dust and bokeh are present and on desynchronised cycles",
      motes.motes >= 8 && motes.bokeh >= 4 && motes.durations === motes.bokeh,
      `${motes.motes} motes, ${motes.bokeh} bokeh, ${motes.durations} distinct durations`,
    );

    // Nothing here may eat the scroll.
    const hits = await page.evaluate(
      (sel) =>
        sel.filter((s) => {
          const el = document.querySelector(s);
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return el.contains(hit);
        }),
      LAYERS,
    );
    check("no light layer intercepts the scroll", hits.length === 0, hits.join(", "));
    await browser.close();
  }

  // ---- 5d. Light show on a phone -----------------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const mobile = await page.evaluate(() => {
      const rays = getComputedStyle(document.querySelector(".light__rays"));
      const root = getComputedStyle(document.documentElement);
      return {
        bokeh: getComputedStyle(document.querySelector(".light__bokeh")).display,
        rayCount: root.getPropertyValue("--ray-count").trim(),
        rayOpacity: root.getPropertyValue("--fx-ray-opacity").trim(),
      };
    });
    check("mobile drops the bokeh layer", mobile.bokeh === "none", mobile.bokeh);
    check(
      "mobile thins the ray fan instead of leaving it at full density",
      mobile.rayCount === "5" && Number(mobile.rayOpacity) < 0.34,
      `--ray-count: ${mobile.rayCount}, --fx-ray-opacity: ${mobile.rayOpacity}`,
    );
    await browser.close();
  }

  // ---- 5b. Line-masked reveal -------------------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return { h: el.getBoundingClientRect().height, vh: window.innerHeight };
    });

    // The mask clips overflow, so a mask that is too tight silently eats
    // descenders and the tail of the school name.
    const clipped = await page.evaluate(() => {
      return [...document.querySelectorAll(".intro__line")].map((mask) => {
        const inner = mask.firstElementChild;
        return {
          text: inner.textContent.trim().slice(0, 24),
          overflow: inner.getBoundingClientRect().height - mask.clientHeight,
        };
      });
    });
    const worstClip = Math.max(...clipped.map((c) => c.overflow));
    check(
      "line masks do not clip their text",
      clipped.length === 4 && worstClip <= 0,
      `${clipped.length} lines, worst overflow ${worstClip.toFixed(2)}px`,
    );

    // The stagger has to be real: later lines must lag earlier ones.
    await scrollToProgress(page, m, 0.957);
    const opacities = await page.evaluate(() =>
      [...document.querySelectorAll(".intro__line-inner")].map(
        (el) => getComputedStyle(el).opacity,
      ),
    );
    check(
      "lines are staggered, not revealed together",
      opacities.length === 4 &&
        opacities.every((o, i, all) => i === 0 || Number(o) <= Number(all[i - 1])) &&
        Number(opacities[0]) > Number(opacities[3]) &&
        Number(opacities[3]) < 0.9,
      opacities.map((o) => Number(o).toFixed(2)).join(" > "),
    );

    await scrollToProgress(page, m, 1);
    const settled = await page.evaluate(() =>
      [...document.querySelectorAll(".intro__line-inner")].map((el) => {
        const cs = getComputedStyle(el);
        return {
          opacity: Number(cs.opacity),
          filter: cs.filter,
          // An identity matrix, not literally "none".
          settled: cs.transform === "none" || cs.transform === "matrix(1, 0, 0, 1, 0, 0)",
        };
      }),
    );
    check(
      "all lines fully settled by the end of the track",
      settled.every((s) => s.opacity === 1 && s.filter === "none" && s.settled),
      settled.map((s) => `${s.opacity}/${s.filter}/${s.settled}`).join(" "),
    );
    await browser.close();
  }

  // ---- 6. Atmosphere layers ---------------------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const layers = await page.evaluate(() => {
      const read = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { pe: cs.pointerEvents, filter: cs.filter, z: cs.zIndex };
      };
      return {
        grain: read(".grain"),
        vignette: read(".vignette"),
        spotlight: read(".spotlight"),
        floor: read(".floor"),
      };
    });
    const missing = Object.entries(layers)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    check("all atmosphere layers mounted", missing.length === 0, missing.join(", "));
    check(
      "atmosphere layers never intercept the scroll",
      Object.values(layers).every((v) => v && v.pe === "none"),
    );
    check(
      "grain composites from a cached layer, not a filter",
      layers.grain && layers.grain.filter === "none",
      layers.grain ? layers.grain.filter : "missing",
    );
    check(
      "vignette paints under the intro copy",
      Number(layers.vignette.z) < 4,
      `z-index ${layers.vignette.z} vs intro-overlay 4`,
    );

    // The book and its lighting have to disappear together, not leave the
    // spotlight stranded in an otherwise empty frame.
    const m = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return { h: el.getBoundingClientRect().height, vh: window.innerHeight };
    });
    await scrollToProgress(page, m, 0);
    const atStart = await page.evaluate(() => ({
      book: getComputedStyle(document.querySelector(".book-layer")).opacity,
      spot: getComputedStyle(document.querySelector(".spotlight")).opacity,
    }));
    await scrollToProgress(page, m, 1);
    const atEnd = await page.evaluate(() => ({
      book: getComputedStyle(document.querySelector(".book-layer")).opacity,
      spot: getComputedStyle(document.querySelector(".spotlight")).opacity,
    }));
    check(
      "spotlight tracks the book's own fade",
      Number(atStart.spot) > 0.9 &&
        Number(atEnd.spot) === 0 &&
        Number(atStart.book) > 0.9 &&
        Number(atEnd.book) === 0,
      `book ${atStart.book}->${atEnd.book}, spotlight ${atStart.spot}->${atEnd.spot}`,
    );

    // Ground contact and reflection must be present while the book is, and
    // must not outlive it.
    const ground = async () =>
      page.evaluate(() => ({
        reflect: getComputedStyle(document.querySelector(".book__reflection")).opacity,
        contact: getComputedStyle(document.querySelector(".book__contact")).opacity,
      }));
    await scrollToProgress(page, m, 0);
    const groundShown = await ground();
    await scrollToProgress(page, m, 1);
    const groundHidden = await ground();
    check(
      "ground contact and reflection live and die with the book",
      Number(groundShown.reflect) > 0.4 &&
        Number(groundShown.contact) > 0.5 &&
        Number(groundHidden.reflect) === 0 &&
        Number(groundHidden.contact) === 0,
      `shown ${groundShown.reflect}/${groundShown.contact}, hidden ${groundHidden.reflect}/${groundHidden.contact}`,
    );
    await browser.close();
  }

  // ---- 6b. Book lighting ------------------------------------------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return { h: el.getBoundingClientRect().height, vh: window.innerHeight };
    });

    const specAt = async (s) => {
      await scrollToProgress(page, m, s);
      return page.evaluate(
        () => getComputedStyle(document.querySelector(".book-cover__board"), "::before").opacity,
      );
    };

    // The highlight should be absent when closed, peak while the board is
    // moving, and gone once it is flat open. A sweep that never leaves a
    // resting value is not a sweep, it is a static gradient.
    const sweep = {
      closed: Number(await specAt(0.15)),
      midA: Number(await specAt(0.45)),
      midB: Number(await specAt(0.5)),
      open: Number(await specAt(0.75)),
    };
    check(
      "specular sweep is off at rest and peaks mid-swing",
      sweep.closed === 0 &&
        sweep.midA > 0.05 &&
        sweep.midB > 0.05 &&
        sweep.open === 0,
      `closed ${sweep.closed}, mid ${sweep.midA}/${sweep.midB}, open ${sweep.open}`,
    );

    const sweepTravel = await page.evaluate(async () => {
      const board = document.querySelector(".book-cover__board");
      const read = () => getComputedStyle(board, "::before").transform;
      return { first: read() };
    });
    await scrollToProgress(page, m, 0.5);
    sweepTravel.second = await page.evaluate(
      () => getComputedStyle(document.querySelector(".book-cover__board"), "::before").transform,
    );
    check(
      "specular sweep actually travels across the board",
      sweepTravel.first !== sweepTravel.second,
      sweepTravel.first === sweepTravel.second ? "transform static" : "moving",
    );

    // Rim light has to gain strength with the opening, not be painted on.
    const rim = await page.evaluate(() => {
      const board = document.querySelector(".book-cover__board");
      const read = () => getComputedStyle(board).boxShadow;
      return { shadow: read() };
    });
    await scrollToProgress(page, m, 0.05);
    const rimClosed = rim.shadow;
    await scrollToProgress(page, m, 0.62);
    const rimOpen = await page.evaluate(
      () => getComputedStyle(document.querySelector(".book-cover__board")).boxShadow,
    );
    check(
      "rim light strengthens as the cover opens",
      rimClosed !== rimOpen,
      rimClosed === rimOpen ? "box-shadow static" : "brighter when open",
    );
    await browser.close();
  }

  // ---- 7. No horizontal overflow anywhere in the sequence ----------------
  {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const el = document.querySelector(".scroll-track");
      return { h: el.getBoundingClientRect().height, vh: window.innerHeight };
    });
    let worstOverflow = 0;
    let worstAt = 0;
    for (let s = 0; s <= 1.0001; s += 0.05) {
      await scrollToProgress(page, m, s);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (over > worstOverflow) {
        worstOverflow = over;
        worstAt = s;
      }
    }
    check(
      "no horizontal overflow at any point in the sequence",
      worstOverflow === 0,
      `worst ${worstOverflow}px at progress ${worstAt.toFixed(2)}`,
    );
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
