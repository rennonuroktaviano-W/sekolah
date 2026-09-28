"use client";

import { Atmosphere } from "./Atmosphere";
import { BookScene } from "./BookScene";
import { SchoolIntro } from "./SchoolIntro";
import { ScrollProgress } from "./ScrollProgress";
import { useBookScroll } from "@/hooks/useBookScroll";

/**
 * The whole landing experience as one continuous visual take: a pinned book
 * scene that plays out on scroll, resolving into the school introduction.
 *
 * Layer order is explicit and load-bearing. Depth layers first, the book, then
 * the vignette over the book but under the copy, then the light takeover, then
 * the intro, then grain on top of everything.
 */
export function LandingExperience() {
  const trackRef = useBookScroll<HTMLDivElement>();

  return (
    <main>
      <div className="scroll-track" ref={trackRef}>
        <div className="scroll-track__stage">
          <Atmosphere />
          <BookScene />
          <div className="scene-transition" aria-hidden="true" />
          <div className="intro-overlay">
            <SchoolIntro />
          </div>
          <ScrollProgress />
        </div>
      </div>
    </main>
  );
}

export default LandingExperience;
