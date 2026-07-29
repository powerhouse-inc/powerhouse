const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)/i;

function channel(value: string): string {
  const byte = Math.round(Number(value));
  return Math.min(255, Math.max(0, byte)).toString(16).padStart(2, "0");
}

/** Convert a host theme accent color to the hex Privy's `appearance` requires, or `undefined` if it is not expressible. Hosts resolve CSS tokens through `getComputedStyle`, which yields `rgb(...)`, so plain pass-through would be rejected. Alpha is dropped: Privy derives its own variants. */
export function toPrivyAccentColor(
  color: string | undefined,
): `#${string}` | undefined {
  if (!color) return undefined;
  const value = color.trim();
  if (HEX.test(value)) return value as `#${string}`;
  const rgb = RGB.exec(value);
  if (!rgb) return undefined;
  return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
}
