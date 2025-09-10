import type { Size } from "../types/index.js";

export function getDimensions(size?: Size) {
  if (!size) return {};

  if (typeof size === "number") {
    return {
      width: size.toString() + "px",
      height: size.toString() + "px",
    };
  }

  return {
    width: size,
    height: size,
  };
}
