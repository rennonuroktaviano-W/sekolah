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

/** The page block: a curved spread, a fore-edge, and the crease shadow. */
export function BookPages() {
  return (
    <div className="book-pages" aria-hidden="true">
      <div className="book-pages__surface">
        {Array.from({ length: STRIPS }, (_, index) => (
          <span
            key={index}
            className="book-pages__strip"
            style={{ "--strip": index } as React.CSSProperties}
          />
        ))}

        {/*
         * Both of these are children of the surface, not siblings, so they
         * inherit the same curve and recession. As siblings they were flat
         * planes lying over a curved block and floated clear of it.
         */}
        <div className="book-pages__fore-edge" />
        <div className="book-pages__crease" />
      </div>
    </div>
  );
}

export default BookPages;
