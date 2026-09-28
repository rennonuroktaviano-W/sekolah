"use client";

/**
 * The light that begins at the crease of the open book and expands until it
 * becomes the background of the next scene. Layered radially so the core stays
 * warm and the falloff stays soft instead of banding.
 */
export function LightBurst() {
  return (
    <div className="light" aria-hidden="true">
      <div className="light__crease" />
      <div className="light__halo" />
      <div className="light__bloom" />
    </div>
  );
}

export default LightBurst;
