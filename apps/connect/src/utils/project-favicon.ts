/**
 * Project favicons (proof of concept). When the runtime config carries the
 * project's app-icon variants (resolved by the runner from
 * `icons.app` + `<name>_16x16/_32x32/_64x64.png`), they REPLACE the static
 * `<link rel="icon" href="icon.ico">` from index.html — not just join it:
 * with several icon links a browser may keep the static one (often the last
 * declared wins), so the Connect icon would stay in the tab.
 *
 * Called at boot right after the runtime config loads, before the app
 * renders, so the tab never shows the Connect icon once the config is known.
 * Without project icons nothing changes.
 */
const MARK = "data-project-favicon";

type IconVariant = { size: number; src: string };

function appVariants(config: unknown): IconVariant[] {
  const variants = (
    config as { connect?: { icons?: { appVariants?: unknown } } } | undefined
  )?.connect?.icons?.appVariants;
  if (!Array.isArray(variants)) return [];
  return variants.filter(
    (v): v is IconVariant =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as IconVariant).size === "number" &&
      typeof (v as IconVariant).src === "string",
  );
}

export function applyProjectFavicons(
  config: unknown,
  doc: Document = document,
): boolean {
  const variants = appVariants(config);
  if (variants.length === 0) return false;
  // Drop every icon link that is not ours (the static icon.ico, a stale set).
  for (const link of doc.head.querySelectorAll<HTMLLinkElement>(
    'link[rel~="icon"]',
  )) {
    link.remove();
  }
  for (const { size, src } of variants) {
    const link = doc.createElement("link");
    link.rel = "icon";
    link.type = src.startsWith("data:image/svg")
      ? "image/svg+xml"
      : "image/png";
    link.setAttribute("sizes", `${size}x${size}`);
    link.href = src;
    link.setAttribute(MARK, "");
    doc.head.appendChild(link);
  }
  return true;
}
