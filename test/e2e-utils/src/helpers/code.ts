/**
 * Normalizes code strings by removing excess whitespace and formatting braces consistently.
 * @param code - The code string to normalize
 * @returns The normalized code string
 */
export const normalizeCode = (code: string | null | undefined) => {
  if (!code) return "";

  return code
    .replace(/\s+/g, " ")
    .replace(/\s*{\s*/g, " { ")
    .replace(/\s*}\s*/g, " }")
    .replace(/\s+/g, " ")
    .trim();
};
