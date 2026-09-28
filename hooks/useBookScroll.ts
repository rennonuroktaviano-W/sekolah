"use client";

import { useEffect, useRef } from "react";
import { clamp, easeInOutCubic, easeOutCubic, stage } from "@/lib/motion";

/** Scroll progress below which the book is still considered "at rest". */
const IDLE_UNTIL = 0.12;

/**
 * Scroll controller for the book sequence.
 *
 * A tall element provides the scroll distance; a sticky stage inside it holds
 * the visual. Every frame we normalize scroll into 0..1, derive the whole
 * animation from that single number, and write the result out as custom
 * properties. Nothing goes into React state, so scrolling never triggers a
 * re-render, and because every value is a pure function of progress, scrolling
 * back up replays the sequence in reverse for free.
 *
 * The rAF loop only stays alive while the book is at rest (to breathe) or
 * while the visitor is actively scrolling, so it costs nothing at the end of
 * the experience.
 */
export function useBookScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    let startTime = 0;
    let scrollingUntil = 0;
    let running = false;

    const write = (name: string, value: number, unit = "") =>
      node.style.setProperty(name, `${value.toFixed(4)}${unit}`);

    /** Derives and writes one frame. Returns the normalized scroll progress. */
    const apply = (elapsed: number): number => {
      const rect = node.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = travel > 0 ? clamp(-rect.top / travel) : 0;

      // Stage windows, straight from the PRD timeline.
      const approach = easeInOutCubic(stage(progress, 0.15, 0.35));
      const open = easeInOutCubic(stage(progress, 0.35, 0.6));
      const reveal = easeOutCubic(stage(progress, 0.6, 0.75));
      const light = easeInOutCubic(stage(progress, 0.75, 0.9));
      const fill = easeInOutCubic(stage(progress, 0.9, 1));

      // Idle window: a slow drift so the closed book never looks frozen.
      const idleWeight = 1 - stage(progress, 0.08, IDLE_UNTIL);
      const driftY = Math.sin(elapsed * 0.00055) * 5 * idleWeight;
      const driftR = Math.sin(elapsed * 0.00037) * 1.1 * idleWeight;

      // Camera: eases in during approach, then lifts as the book opens.
      write("--progress", progress);
      write("--book-scale", 1 + approach * 0.26 + reveal * 0.12 - light * 0.08);
      write("--book-ty", driftY - approach * 3 + light * 30 - fill * 80, "px");
      write("--book-rx", 6 - open * 10 - reveal * 4 + approach * 3, "deg");
      write(
        "--book-ry",
        -20 + approach * 8 + open * 12 - reveal * 9 + driftR,
        "deg",
      );

      // The book dissolves into its own light before any text arrives, so the
      // introduction never has to compete with the book for legibility.
      write("--book-fade", 1 - stage(progress, 0.86, 0.93));

      // Opening: the cover swings around the spine on the left edge.
      write("--cover-angle", -178 * open, "deg");
      write("--page-open", open);

      // Reveal: the spread tips toward the viewer, the leaves fan out, and
      // the crease starts to warm up before the burst proper.
      write("--spread-rx", reveal * -9, "deg");
      write("--page-fan", reveal);
      write("--seam", stage(progress, 0.62, 0.78));

      // Light: a glow at the crease grows into a bloom, then takes the frame.
      write("--light-scale", 0.08 + light * 0.55 + fill * 1.4);
      write("--light-opacity", light * (1 - fill * 0.3));
      write("--light-blur", 2 + light * 8, "px");
      write("--bloom", light * (1 - fill * 0.7));
      write("--fill-opacity", fill);

      // Scene 02 typography rises out of the light rather than sliding in.
      write("--intro", easeOutCubic(stage(progress, 0.94, 1)));

      write("--shadow-spread", 1 + approach * 0.28 - open * 0.4);
      write("--shadow-opacity", 0.85 - open * 0.5);

      return progress;
    };

    const tick = (time: number) => {
      if (!startTime) startTime = time;
      const progress = apply(time - startTime);

      if (progress < IDLE_UNTIL || performance.now() < scrollingUntil) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      running = false;
      frame = 0;
    };

    const schedule = () => {
      if (running) return;
      running = true;
      startTime = 0;
      frame = window.requestAnimationFrame(tick);
    };

    const onScroll = () => {
      scrollingUntil = performance.now() + 160;
      if (!running) schedule();
    };

    schedule();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return ref;
}
