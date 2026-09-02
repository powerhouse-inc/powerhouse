// Shim for @/lib/color-utils (average-color extraction is not needed).
export function useBackgroundColorForPieceLogo(_logoUrl?: string): string {
  return "transparent";
}
