/** File suffixes that should never be processed by this migration script. */
export const excludePatterns = [
  ".css",
  "add-tailwind-darkmode-classes.ts",
] as const;

/** Tailwind variant prefix used for dark-mode class names. */
export const darkPrefix = "dark:" as const;
