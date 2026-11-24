import { useId } from "react";
import { cn } from "../lib/cn.js";

/** The lightning-shaped gap between the two halves of the Powerhouse
 * logomark (`PowerhouseLogoSmall` in the design system), drawn on its own. */
const BOLT_PATH =
  "M10.0059 0L3.41636 5.45646C2.44979 6.25682 2.3795 7.71452 3.26456 8.60418L5.54425 10.8957C6.21311 11.568 6.35783 12.6012 5.89944 13.4314L4.48126 16H5.70922L12.612 10.37C13.5866 9.57512 13.6656 8.11402 12.7825 7.21868L10.3641 4.7669C9.70183 4.09549 9.55899 3.06891 10.0128 2.24221L11.2436 0Z";
const VIEW_BOX = "-1.5 -1 19 18";
const STROKE_WIDTH = 1.4;
const FROM = "#8b5cf6";
const TO = "#d946ef";

export function BoltMark({ className }: { className?: string }) {
  const id = useId();
  const paint = `url(#${id})`;
  return (
    <svg
      viewBox={VIEW_BOX}
      aria-hidden
      data-slot="devtools-mark"
      className={cn("size-5 shrink-0", className)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={FROM} />
          <stop offset="1" stopColor={TO} />
        </linearGradient>
      </defs>
      <path
        d={BOLT_PATH}
        fill={paint}
        stroke={paint}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const BOLT_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${FROM}"/><stop offset="1" stop-color="${TO}"/></linearGradient></defs><path d="${BOLT_PATH}" fill="url(#g)" stroke="url(#g)" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/></svg>`,
)}`;
