"use client";

import { SCHOOL } from "@/lib/content";

/**
 * Scene 02. Content is always present in the DOM for assistive tech and
 * no-JS readers; the scroll timeline only controls how it emerges from the
 * light, never whether it exists.
 *
 * Each block is a mask with a rising line inside it, staggered by `--line`.
 * That is a transform-only reveal: the earlier version cross-faded the whole
 * block in behind a `filter: blur()`, which cost a repaint per frame and read
 * as a generic fade. This reads as type being pulled out of the light.
 */
export function SchoolIntro() {
  // The stagger index is consumed by CSS, so it rides along as a custom
  // property rather than as a class per line.
  const line = (index: number) => ({ "--line": index }) as React.CSSProperties;

  return (
    <section className="intro" aria-labelledby="intro-name">
      <div className="intro__inner">
        <p className="intro__eyebrow">
          <span className="intro__line" style={line(0)}>
            <span className="intro__line-inner">Selamat datang</span>
          </span>
        </p>
        <h1 id="intro-name" className="intro__name">
          <span className="intro__line" style={line(1)}>
            <span className="intro__line-inner">{SCHOOL.name}</span>
          </span>
        </h1>
        <p className="intro__tagline">
          <span className="intro__line" style={line(2)}>
            <span className="intro__line-inner">{SCHOOL.tagline}</span>
          </span>
        </p>
        <p className="intro__description">
          <span className="intro__line" style={line(3)}>
            <span className="intro__line-inner">{SCHOOL.description}</span>
          </span>
        </p>
      </div>
    </section>
  );
}

export default SchoolIntro;
