"use client";

import { BookCover } from "./BookCover";
import { BookPages } from "./BookPages";
import { LightBurst } from "./LightBurst";

/**
 * Scene 01. A closed hardcover that answers the scroll timeline: the camera
 * moves in, the cover swings open around its spine, and light escapes from
 * inside. Every value is driven by custom properties set on the scroll
 * container, so this component never re-renders.
 *
 * The light burst is a sibling of the book, not a child of it. Both live
 * inside the camera transform, so the burst still tracks the book as it
 * drifts and scales, but it is no longer a descendant of the element that
 * fades out on --book-fade. When it was a child, that fade multiplied into
 * the burst's own envelope and halved the climax of the light show.
 */
export function BookScene() {
  return (
    <div className="book-scene">
      <div className="book-scene__stage">
        <div className="book-layer">
          <div className="book">
            <div className="book__reflection" />
            <div className="book__shadow" />
            <div className="book__contact" />

            <div className="book__body">
              <div className="book__back-cover" />
              <div className="book__spine" />
              <BookPages />
              <BookCover />
            </div>
          </div>
        </div>
        <LightBurst />
      </div>
    </div>
  );
}

export default BookScene;
