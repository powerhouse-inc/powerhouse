/**
 * Geometric placeholder mark: arcs meeting at a center point, reading as a
 * rosette / compass star. Stands in for the product's logo until an asset is
 * attached. Inherits color from the surrounding text.
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      {[0, 45, 90, 135].map((deg) => (
        <line
          key={deg}
          x1={24}
          y1={24}
          x2={24 + 16 * Math.cos((deg * Math.PI) / 180)}
          y2={24 + 16 * Math.sin((deg * Math.PI) / 180)}
        />
      ))}
      {[0, 45, 90, 135].map((deg) => (
        <line
          key={`n${deg}`}
          x1={24}
          y1={24}
          x2={24 - 16 * Math.cos((deg * Math.PI) / 180)}
          y2={24 - 16 * Math.sin((deg * Math.PI) / 180)}
        />
      ))}
      <circle cx={24} cy={24} r={5} fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Pick black or white text for legibility over a hex background. */
export function readableText(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#1a1a1a";
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  // Perceived luminance (ITU-R BT.601).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}
