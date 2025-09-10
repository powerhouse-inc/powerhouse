import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export * from "./fixedForwardRef.js";
export * from "./getDimensions.js";
export * from "./mergeClassNameProps.js";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
