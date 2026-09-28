"use client";

/**
 * The light that begins at the crease of the open book and expands until it
 * becomes the background of the next scene. Layered radially so the core stays
 * warm and the falloff stays soft instead of banding.
 *
 * The later layers are the spectacle: shafts, an anamorphic streak, a chroma
 * split at the peak, drifting bokeh and dust. All of them are gradients on
 * transform and opacity only, so the takeover stays on the compositor and
 * never triggers a layout or paint per frame.
 */

const BOKEH = 5;
const MOTES = 9;

export function LightBurst() {
  return (
    <div className="light" aria-hidden="true">
      <div className="light__crease" />
      <div className="light__halo" />
      <div className="light__rays" />
      <div className="light__bloom" />

      {/* Anamorphic flare: a wide, thin bar with a hot core. */}
      <div className="light__streak" />
      {/* Chromatic split, offset copies of the streak. */}
      <div className="light__chroma light__chroma--cool" />
      <div className="light__chroma light__chroma--warm" />

      <div className="light__bokeh">
        {Array.from({ length: BOKEH }, (_, i) => (
          <span key={i} className="light__bokeh-dot" />
        ))}
      </div>

      <div className="light__dust">
        {Array.from({ length: MOTES }, (_, i) => (
          <span key={i} className="light__mote" />
        ))}
      </div>
    </div>
  );
}

export default LightBurst;
