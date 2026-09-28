"use client";

import { SCHOOL } from "@/lib/content";

/**
 * Scene 02. Content is always present in the DOM for assistive tech and
 * no-JS readers; the scroll timeline only controls how it emerges from the
 * light, never whether it exists.
 */
export function SchoolIntro() {
  return (
    <section className="intro" aria-labelledby="intro-name">
      <div className="intro__inner">
        <p className="intro__eyebrow">Selamat datang</p>
        <h1 id="intro-name" className="intro__name">
          {SCHOOL.name}
        </h1>
        <p className="intro__tagline">{SCHOOL.tagline}</p>
        <p className="intro__description">{SCHOOL.description}</p>
      </div>
    </section>
  );
}

export default SchoolIntro;
