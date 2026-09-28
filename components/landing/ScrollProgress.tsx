"use client";

/**
 * Thin scroll indicator for the opening scene. Purely decorative, hidden from
 * assistive tech, and faded out by the scroll timeline as soon as the visitor
 * starts exploring.
 */
export function ScrollProgress() {
  return (
    <div className="scroll-hint" aria-hidden="true">
      <span className="scroll-hint__label">Scroll to explore</span>
      <span className="scroll-hint__track">
        <span className="scroll-hint__dot" />
      </span>
    </div>
  );
}

export default ScrollProgress;
