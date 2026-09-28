"use client";

/**
 * How many vertical strips the spread is cut into. A real open book is not a
 * flat plane, it is a shallow cylinder that falls away toward the fore-edges,
 * and a single element cannot express that. Each strip is rotated about the
 * spine and pushed back in Z in proportion to its distance from it, so the
 * block reads as a curved surface.
 *
 * The count lives here and is handed to CSS as --strip-count, so the number of
 * strips rendered and the number the geometry divides by cannot drift apart.
 */
const STRIPS = 12;

/** How many top pages are lifted off the block and fall flat on the reveal. */
const LEAVES = 2;

/**
 * The page block: a curved spread, a fore-edge, the crease shadow, and two
 * leaves that were holding their own against the cover.
 */
export function BookPages() {
  return (
    <div
      className="book-pages"
      style={{ "--strip-count": STRIPS } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="book-pages__surface">
        {Array.from({ length: STRIPS }, (_, index) => (
          <span
            key={index}
            className="book-pages__strip"
            style={{ "--strip": index } as React.CSSProperties}
          />
        ))}

        {/*
         * Two top pages stay half-lifted by the cover until it is well open,
         * then fall flat onto the spread. They are what makes the opening a
         * book that was closed rather than a cover over a ready-made spread:
         * at rest and most of the approach they are invisible, they stand as
         * the cover lifts, and they settle through the reveal.
         */}
        {Array.from({ length: LEAVES }, (_, index) => (
          <div
            key={`leaf-${index}`}
            className="book-pages__leaf"
            style={{ "--leaf": index } as React.CSSProperties}
          >
            <div className="book-pages__leaf-face book-pages__leaf--recto" />
            <div className="book-pages__leaf-face book-pages__leaf--verso" />
          </div>
        ))}

        {/*
         * The crease and the fore-edge are children of the surface so they
         * inherit the same curve and recession. The crease is raised above the
         * leaves once the spread opens, because its glow is the light escaping
         * from the spine and it has to read as coming out from between the
         * pages, not from behind them.
         */}
        <div className="book-pages__crease" />
        <div className="book-pages__fore-edge" />
      </div>
    </div>
  );
}

export default BookPages;
