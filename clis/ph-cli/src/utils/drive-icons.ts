/**
 * Icons for the drives ph-cli creates, inlined as data URIs.
 *
 * These used to be IPFS URLs on a private gateway, which now answers 403 -
 * and a drive stores its icon as a plain URL in document state, so the moment
 * that URL rots every client renders a broken image, for as long as the drive
 * exists. A public gateway would only move the problem: IPFS gateways are
 * frequently overloaded, and a drive icon must not depend on the network at
 * all.
 *
 * Data URIs keep the asset inside this package and inside the drive: no fetch,
 * no gateway, no deploy-base or cross-origin question, and nothing to 404.
 * Both are a few hundred bytes - the size of the string below is the entire
 * cost, paid once in the drive's state.
 *
 * Kept URL-encoded rather than base64 so the markup stays readable and
 * reviewable (`#` must be `%23`; literal `<` and `>` are fine unencoded in a
 * data URI but are encoded here so the value is also safe to paste into
 * markup).
 */

/** Encodes an SVG for use in a `data:` URI, smaller than base64 and readable. */
function svgDataUri(svg: string): string {
  const compact = svg.replace(/\s+/g, " ").trim();
  return `data:image/svg+xml,${compact
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/"/g, "%22")}`;
}

// A filled slate tile with a white chevron: legible at 32px, and readable on
// both the light and dark sidebar because it carries its own background.
const VETRA_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="#3E4C59"/>
  <path d="M9.5 11 16 22l6.5-11" fill="none" stroke="#FFFFFF" stroke-width="2.6"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// The preview drive is the same mark, lightened and dashed: it reads as the
// provisional sibling of the drive above it rather than a second product.
const VETRA_PREVIEW_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect x="1" y="1" width="30" height="30" rx="6" fill="#6B7A8C"
        stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="3 2.5" opacity="0.95"/>
  <path d="M9.5 11 16 22l6.5-11" fill="none" stroke="#FFFFFF" stroke-width="2.6"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** Icon for the Vetra drive. */
export const VETRA_DRIVE_ICON = svgDataUri(VETRA_SVG);

/** Icon for the Vetra Preview drive. */
export const VETRA_PREVIEW_DRIVE_ICON = svgDataUri(VETRA_PREVIEW_SVG);

/**
 * Icon URLs previously baked into drives that no longer resolve. A drive
 * created before this change still carries one in its state, so the callers
 * that create these drives replace a stored icon matching this list.
 */
export const RETIRED_DRIVE_ICONS: readonly string[] = [
  "https://azure-elderly-tortoise-212.mypinata.cloud/ipfs/bafkreibf2xokjqqtomqjd2w2xxmmhvogq4262csevclxh6sbrjgmjfre5u",
  "https://azure-elderly-tortoise-212.mypinata.cloud/ipfs/bafkreifddkbopiyvcirf7vaqar74th424r5phlxkdxniirdyg3qgu2ajha",
];
