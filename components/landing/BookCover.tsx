"use client";

import { SCHOOL } from "@/lib/content";

/**
 * Front cover of the hardcover. Rotated around the spine edge so the
 * opening reads as a physical board swinging, not a flat element rotating.
 *
 * The title is stamped here rather than left to the introduction because the
 * cover is the only surface the visitor sees before the scene resolves, and an
 * unlabelled board reads as an unfinished rectangle. It is part of the
 * illustration, so the whole cover is aria-hidden and the school's name is
 * announced once, by the introduction.
 */
export function BookCover({ children, className = "" }: BookCoverProps) {
  return (
    <div className={`book-cover ${className}`} aria-hidden="true">
      <div className="book-cover__board" />
      <div className="book-cover__inner" />
      <div className="book-cover__detail">
        <span className="book-cover__rule" />
        {/*
         * Split once, so the name can break across lines at a sensible width on
         * a narrow phone instead of overflowing the board or breaking mid-word.
         */}
        <span className="book-cover__title">
          {SCHOOL.name.split(" ").map((word, i) => (
            <span key={`${word}-${i}`} className="book-cover__word">
              {word}
            </span>
          ))}
        </span>
        <span className="book-cover__rule" />
        {children}
      </div>
    </div>
  );
}

type BookCoverProps = {
  children?: React.ReactNode;
  className?: string;
};

export default BookCover;
