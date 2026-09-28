"use client";

type BookCoverProps = {
  children?: React.ReactNode;
  className?: string;
};

/**
 * Front cover of the hardcover. Rotated around the spine edge so the
 * opening reads as a physical board swinging, not a flat element rotating.
 */
export function BookCover({ children, className = "" }: BookCoverProps) {
  return (
    <div className={`book-cover ${className}`} aria-hidden="true">
      <div className="book-cover__board" />
      <div className="book-cover__inner" />
      <div className="book-cover__detail">{children}</div>
    </div>
  );
}

export default BookCover;
