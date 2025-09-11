export function getBasePath() {
  if (typeof document === "undefined") {
    return "/";
  }

  const baseEl = document.querySelector("base");
  const href = baseEl?.getAttribute("href");
  return href || "/";
}
