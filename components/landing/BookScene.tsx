"use client";

import { BookCover } from "./BookCover";
import { BookPages } from "./BookPages";
import { LightBurst } from "./LightBurst";

/**
 * Scene 01. A closed hardcover that answers the scroll timeline: the camera
 * moves in, the cover swings open around its spine, and light escapes from
 * inside. Every value is driven by custom properties set on the scroll
 * container, so this component never re-renders.
 */
export function BookScene() {
  return (
    <div className="book-scene">
      <div className="book-scene__stage book-stage">
        <div className="book">
          <div className="book__shadow" />

          <div className="book__body">
            <div className="book__back-cover" />
            <div className="book__spine" />
            <BookPages />
            <LightBurst />
            <BookCover />
          </div>
        </div>
      </div>
    </div>
  );
}

export default BookScene;
