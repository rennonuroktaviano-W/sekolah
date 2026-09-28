/**
 * Depth and texture for the scene. Three flat layers, all decorative, all
 * `pointer-events: none` so they never intercept the scroll.
 *
 * The vignette is deliberately painted *under* the intro copy: a lens vignette
 * that dimmed the typography at the edges would trade real contrast for mood.
 */
export function Atmosphere() {
  return (
    <>
      <div className="spotlight" aria-hidden="true" />
      <div className="floor" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
    </>
  );
}

export default Atmosphere;
