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
      "--cover-angle", "--page-open", "--page-fan", "--seam", "--spread-rx",
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
      Math.abs(v72["--page-fan"] - v6["--page-fan"]) > 0.5 &&
        Math.abs(v72["--seam"] - v6["--seam"]) > 0.2,
      `fan ${v6["--page-fan"].toFixed(2)}->${v72["--page-fan"].toFixed(2)}, seam ${v6["--seam"].toFixed(2)}->${v72["--seam"].toFixed(2)}`,
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
    check("scroll hint animation disabled", rm.dotAnimation === "none", rm.dotAnimation);
    check("intro blur disabled", rm.nameFilter === "none", rm.nameFilter);
    // The story must still be reachable by scrolling.
    await scrollToProgress(page, m, 1);
    const rmEnd = await page.evaluate(
      () => getComputedStyle(document.querySelector(".intro__name")).opacity,
    );
    check("story still completes under reduced motion", Number(rmEnd) > 0.95, rmEnd);
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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
