// Shim for @/components/custom/image-with-color-background: plain image,
// no average-color background extraction.
import type { ImgHTMLAttributes, ReactNode } from "react";

interface ImageWithColorBackgroundProps extends ImgHTMLAttributes<HTMLImageElement> {
  fallback?: ReactNode;
  border?: boolean;
  roundedCorner?: boolean;
}

export function ImageWithColorBackground({
  fallback: _fallback,
  border: _border,
  roundedCorner: _roundedCorner,
  ...props
}: ImageWithColorBackgroundProps) {
  return (
    <img
      {...props}
      style={{ objectFit: "contain", width: "100%", height: "100%" }}
    />
  );
}
