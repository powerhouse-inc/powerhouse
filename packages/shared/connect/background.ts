import type {
  PHBackground,
  PHBackgroundLayer,
  PHBackgroundLayers,
  PHEdges,
  PHImageRef,
  PHLength,
  PHSchemedColor,
  PHSchemedImage,
} from "../clis/types.js";

// A decorated pane's background (`connect.branding.homeBackground`, the
// desktop loading page) as both hosts render it. Pure: the Connect home
// screen turns a layer into inline styles with it, the desktop shell
// generator into static CSS, so the same config lands in the same place
// on either. Resolution of image paths is not done here; see the Connect
// build (builder-tools) and the desktop projection.

export type PHEdge = "top" | "right" | "bottom" | "left";

export const EDGES: readonly PHEdge[] = ["top", "right", "bottom", "left"];

/** A single image is one layer pinned to the bottom-right corner. */
export function normalizeBackground(
  background: PHBackground | null | undefined,
): PHBackgroundLayers | null {
  if (!background) return null;
  if (typeof background === "string") {
    return {
      layers: [{ src: background, position: { bottom: 0, right: 0 } }],
    };
  }
  return background;
}

/** The light image and, when it differs, the dark one. */
export function imageVariants(src: PHSchemedImage): {
  light: PHImageRef;
  dark?: PHImageRef;
} {
  if (typeof src === "string") return { light: src };
  return src.dark && src.dark !== src.light
    ? { light: src.light, dark: src.dark }
    : { light: src.light };
}

/** The light colour and, when it differs, the dark one. */
export function colorVariants(
  color: PHSchemedColor | null | undefined,
): { light: string; dark?: string } | null {
  if (!color) return null;
  if (typeof color === "string") return { light: color };
  return color.dark && color.dark !== color.light
    ? { light: color.light, dark: color.dark }
    : { light: color.light };
}

/** A number is px; a string is a CSS length as written. */
export function cssLength(length: PHLength): string {
  return typeof length === "number" ? `${length}px` : length.trim();
}

const FADE_DIRECTION: Record<PHEdge, string> = {
  top: "to bottom",
  right: "to left",
  bottom: "to top",
  left: "to right",
};

/**
 * The CSS declarations (kebab-case) that place one layer inside a
 * `position: relative` pane. The pane's content must come after the layers
 * in the DOM (or carry a z-index) to paint above them.
 */
export function layerDeclarations(
  layer: PHBackgroundLayer,
): Record<string, string> {
  const out: Record<string, string> = {
    position: "absolute",
    "pointer-events": "none",
    "object-fit": "contain",
  };
  const position = layer.position ?? {};
  for (const edge of EDGES) {
    const value = position[edge];
    if (value !== undefined && value !== null) out[edge] = cssLength(value);
  }
  const centreX = !("left" in out) && !("right" in out);
  const centreY = !("top" in out) && !("bottom" in out);
  if (centreX) out.left = "50%";
  if (centreY) out.top = "50%";
  if (centreX || centreY) {
    out.transform = `translate(${centreX ? "-50%" : "0"}, ${centreY ? "-50%" : "0"})`;
  }
  const sizes: Array<[keyof PHBackgroundLayer, string]> = [
    ["width", "width"],
    ["height", "height"],
    ["minWidth", "min-width"],
    ["minHeight", "min-height"],
    ["maxWidth", "max-width"],
    ["maxHeight", "max-height"],
  ];
  for (const [key, property] of sizes) {
    const value = layer[key] as PHLength | null | undefined;
    if (value !== undefined && value !== null) out[property] = cssLength(value);
  }
  if (layer.opacity !== undefined && layer.opacity !== null) {
    out.opacity = String(layer.opacity);
  }
  const fades: string[] = [];
  for (const edge of EDGES) {
    const depth = layer.fade?.[edge];
    if (depth === undefined || depth === null) continue;
    fades.push(
      `linear-gradient(${FADE_DIRECTION[edge]}, transparent, #000 ${cssLength(depth)})`,
    );
  }
  if (fades.length > 0) {
    out["mask-image"] = fades.join(", ");
    if (fades.length > 1) out["mask-composite"] = "intersect";
  }
  return out;
}

/** The declarations as one `style` attribute's text. */
export function layerStyleText(layer: PHBackgroundLayer): string {
  return Object.entries(layerDeclarations(layer))
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");
}

/** The same declarations with the camelCase keys React's `style` takes. */
export function layerStyle(layer: PHBackgroundLayer): Record<string, string> {
  return Object.fromEntries(
    Object.entries(layerDeclarations(layer)).map(([property, value]) => [
      property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
      value,
    ]),
  );
}

function edgesConflict(edges: PHEdges | null | undefined): string | null {
  if (!edges) return null;
  const set = (edge: PHEdge) =>
    edges[edge] !== undefined && edges[edge] !== null;
  if (set("top") && set("bottom")) return "set top or bottom, not both";
  if (set("left") && set("right")) return "set left or right, not both";
  return null;
}

/** What is wrong with a background, one message per problem; empty when it
 * is usable. `at` names the field in the messages. */
export function validateBackground(
  background: PHBackground | null | undefined,
  at = "background",
): string[] {
  const problems: string[] = [];
  const layers = normalizeBackground(background)?.layers ?? [];
  layers.forEach((layer, index) => {
    const where = `${at}.layers[${index}]`;
    const light = typeof layer.src === "string" ? layer.src : layer.src.light;
    if (!light) problems.push(`${where}.src: an image is required`);
    const conflict = edgesConflict(layer.position);
    if (conflict) problems.push(`${where}.position: ${conflict}`);
    if (
      layer.opacity !== undefined &&
      layer.opacity !== null &&
      !(layer.opacity >= 0 && layer.opacity <= 1)
    ) {
      problems.push(`${where}.opacity: must be between 0 and 1`);
    }
  });
  return problems;
}

/**
 * The background with every image reference mapped (resolved to a data URI,
 * rebased to another directory, …). A layer whose light image maps to
 * undefined is dropped; a dark image that does falls back to the light one.
 */
export function mapBackgroundImages(
  background: PHBackgroundLayers,
  map: (ref: PHImageRef) => PHImageRef | undefined,
): PHBackgroundLayers {
  const layers: PHBackgroundLayer[] = [];
  for (const layer of background.layers) {
    const variants = imageVariants(layer.src);
    const light = map(variants.light);
    if (!light) continue;
    const dark = variants.dark ? map(variants.dark) : undefined;
    layers.push({ ...layer, src: dark ? { light, dark } : light });
  }
  return { ...background, layers };
}
