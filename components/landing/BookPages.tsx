"use client";

const LEAF_INSETS = ["0%", "1.4%", "2.8%", "4.2%", "5.6%", "7%"] as const;

/**
 * The page block: layered sheet edges, a visible fore-edge on the right, and
 * the crease shadow down the middle. Reads the scroll timeline straight from
 * inherited custom properties, so it needs no props and never re-renders.
 */
export function BookPages() {
  return (
    <div className="book-pages" aria-hidden="true">
      <div className="book-pages__leaf-stack">
        {LEAF_INSETS.map((inset, index) => (
          <span
            key={inset}
            className="book-pages__leaf"
            style={{ inset, "--leaf-index": index } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Fore-edge: the stacked page edges, seen from the side. */}
      <div className="book-pages__fore-edge" />

      <div className="book-pages__crease" />
    </div>
  );
}

export default BookPages;
