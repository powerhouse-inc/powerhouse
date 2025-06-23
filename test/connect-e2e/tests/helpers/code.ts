export const normalizeCode = (code: string | null | undefined) => {
  if (!code) return "";

  return code
    .replace(/\s+/g, " ")
    .replace(/\s*{\s*/g, " { ")
    .replace(/\s*}\s*/g, " }")
    .replace(/\s+/g, " ")
    .trim();
};
