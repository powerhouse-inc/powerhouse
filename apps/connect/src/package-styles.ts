// Package CSS lives in the external-packages layer: above Connect's reset so
// it can style its editors, below Connect's utilities so it can't override them.
export const LAYER_ORDER =
  "@layer theme, base, components, external-packages, utilities;";
const LAYER_ORDER_ATTR = "data-ph-layer-order";
const PACKAGE_STYLES_ATTR = "data-ph-package-styles";

// Layer order is set by the first declaration in the document, so this goes
// first in <head>, ahead of any stylesheet.
export function declareExternalPackagesLayer(): void {
  if (document.head.querySelector(`style[${LAYER_ORDER_ATTR}]`)) return;
  const order = document.createElement("style");
  order.setAttribute(LAYER_ORDER_ATTR, "");
  order.textContent = LAYER_ORDER;
  document.head.prepend(order);
}

const blobUrls = new Map<string, string>();

/** Mounts, or replaces, a package's compiled CSS in the external-packages layer. */
export function mountPackageStyles(name: string, css: string): void {
  declareExternalPackagesLayer();
  // A blob URL takes the same @import-into-a-layer path as a registry file.
  const url = URL.createObjectURL(new Blob([css], { type: "text/css" }));
  const previous = blobUrls.get(name);
  blobUrls.set(name, url);

  let style = Array.from(
    document.head.querySelectorAll<HTMLStyleElement>(
      `style[${PACKAGE_STYLES_ATTR}]`,
    ),
  ).find((element) => element.getAttribute(PACKAGE_STYLES_ATTR) === name);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute(PACKAGE_STYLES_ATTR, name);
    document.head.appendChild(style);
  }
  style.textContent = `@import url("${url}") layer(external-packages);`;
  if (previous) URL.revokeObjectURL(previous);
}
