/**
 * Detects whether Connect is being rendered inside another app (e.g. inside
 * an iframe in the vetra-cli drive editor). When `?embed=1` is present in the
 * URL, chrome that doesn't make sense in the embedded context — the cookie
 * banner, the outer sidebar — is suppressed.
 */
export function getIsEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("embed");
    return value !== null && value !== "0" && value !== "false";
  } catch {
    return false;
  }
}

export function useIsEmbedded(): boolean {
  return getIsEmbedded();
}
