/**
 * Icon for the drives ph-cli creates, inlined as a data URI.
 *
 * This used to be an IPFS URL on a private gateway, which now answers 403 -
 * and a drive stores its icon as a plain URL in document state, so the moment
 * that URL rots every client renders a broken image, for as long as the drive
 * exists. A public gateway would only move the problem: IPFS gateways are
 * frequently overloaded, and a drive icon must not depend on the network at
 * all.
 *
 * A data URI keeps the asset inside this package and inside the drive: no
 * fetch, no gateway, no deploy-base or cross-origin question, and nothing to
 * 404. A few hundred bytes - the size of the string below is the entire cost,
 * paid once in the drive's state.
 *
 * Kept URL-encoded rather than base64 so the markup stays readable and
 * reviewable (`#` must be `%23`; `<`, `>`, `"` and the CSS braces are legal
 * enough in a data URI but are encoded so the value is also safe to paste
 * into markup).
 */

/** Encodes an SVG for use in a `data:` URI, smaller than base64 and readable. */
function svgDataUri(svg: string): string {
  const compact = svg.replace(/\s+/g, " ").trim();
  return `data:image/svg+xml,${compact
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/"/g, "%22")
    .replace(/\{/g, "%7B")
    .replace(/\}/g, "%7D")}`;
}

// The Powerhouse mark: four petals on a 64 grid, each a square with one
// quarter-circle bite taken out of its inner corner.
const PETALS = [
  "M0 4.6C0 2.1 2.1 0 4.6 0h21.2c2.5 0 4.6 2.1 4.6 4.6v2.8c0 12.7-10.3 23-23 23H4.6C2.1 30.4 0 28.4 0 25.8V4.6Z",
  "M33.6 56.6c0-12.7 10.3-23 23-23h2.8c2.5 0 4.6 2.1 4.6 4.6v21.2c0 2.5-2.1 4.6-4.6 4.6H38.2c-2.5 0-4.6-2.1-4.6-4.6v-2.8Z",
  "M0 38.2c0-2.5 2.1-4.6 4.6-4.6h2.8c12.7 0 23 10.3 23 23v2.8c0 2.5-2.1 4.6-4.6 4.6H4.6C2.1 64 0 61.9 0 59.4V38.2Z",
  "M33.6 4.6C33.6 2.1 35.6 0 38.2 0h21.2C61.9 0 64 2.1 64 4.6v21.2c0 2.5-2.1 4.6-4.6 4.6h-2.8c-12.7 0-23-10.3-23-23V4.6Z",
];

/** The mark in the light theme's grey. */
const LIGHT_FILL = "#404345";

/** The mark in the dark theme's grey. */
const DARK_FILL = "#F3F5F7";

// Drawn in one grey that follows the theme, so the icon sits in the sidebar
// beside the single-tone `currentcolor` glyphs of the other drives instead of
// competing with them.
//
// A data URI rendered through an `<img>` is its own document and cannot see
// the host page's `.dark` class, so the theme is read from the embedded
// document's own color scheme. That is the OS preference by default; the
// renderer propagates an explicit in-app theme choice by setting
// `color-scheme` on the `<img>`, which overrides it where the browser
// supports the propagation.
const MARK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="32" height="32">
  <style>
    path { fill: ${LIGHT_FILL} }
    @media (prefers-color-scheme: dark) { path { fill: ${DARK_FILL} } }
  </style>
  <path d="${PETALS[0]}"/>
  <path d="${PETALS[1]}"/>
  <path d="${PETALS[2]}"/>
  <path d="${PETALS[3]}"/>
</svg>`;

/** Icon for the drives ph-cli creates. */
export const POWERHOUSE_DRIVE_ICON = svgDataUri(MARK_SVG);
