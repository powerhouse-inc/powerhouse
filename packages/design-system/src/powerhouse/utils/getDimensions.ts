import type { Size } from "#design-system";

type Dimensions =
  | { width?: undefined; height?: undefined }
  | { width: string; height: string };

export function getDimensions(size?: Size): Dimensions {
  if (!size) return {};

  if (typeof size === "number") {
    return {
      width: size.toString() + "px",
      height: size.toString() + "px",
    };
  }

  return {
    width: String(size),
    height: String(size),
  };
}
