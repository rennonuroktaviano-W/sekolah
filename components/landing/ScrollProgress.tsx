"use client";

/**
 * The scroll hint for scene 01 and a chapter rail that takes over once the
 * hint is gone. Both are decorative: the page is one linear story, so the
 * browser's own scrollbar already conveys position, and a second progress
 * indicator read by a screen reader would be noise.
 *
 * The rail is driven entirely by the same --progress custom property as the
 * rest of the scene. No state, no listeners, nothing to keep in sync.
 */

const HINT = "Scroll to explore";

/**
 * Chapter marks, keyed to the PRD timeline. `at` is the progress the mark sits
 * at; the label brightens as progress crosses it.
 */
const CHAPTERS = [
  { at: 0.02, label: "Rest" },
  { at: 0.25, label: "Approach" },
  { at: 0.47, label: "Open" },
  { at: 0.67, label: "Reveal" },
  { at: 0.82, label: "Light" },
  // Not past ~0.9, or the mark never finishes lighting before the track ends.
  { at: 0.91, label: "Arrive" },
];

export function ScrollProgress() {
  return (
    <>
      <div className="scroll-hint" aria-hidden="true">
        <span className="scroll-hint__label">{HINT}</span>
        <span className="scroll-hint__track">
          <span className="scroll-hint__dot" />
        </span>
      </div>

      {/*
       * A div, not a nav. It is aria-hidden because the page is one linear
       * story and the scrollbar already reports position, and a navigation
       * landmark that is hidden from assistive tech would be a contradiction.
       */}
      <div className="rail" aria-hidden="true">
        <span className="rail__line">
          <span className="rail__fill" />
        </span>

        {CHAPTERS.map((chapter) => (
          <span key={chapter.label} className="rail__mark">
            <span className="rail__tick" />
            <span
              className="rail__label"
              style={{ "--at": chapter.at } as React.CSSProperties}
            >
              {chapter.label}
            </span>
          </span>
        ))}
      </div>
    </>
  );
}

export default ScrollProgress;
