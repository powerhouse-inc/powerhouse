import { getViewportForBounds, type Rect } from "@xyflow/react";

const PADDING = 64;
const MAX_CANVAS_SIDE = 8_192;
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_RATIO = 2;
/** Firefox and Safari can start reading a download's blob after `click()`
 * returns; FileSaver.js waits this long before revoking its URL. */
const REVOKE_AFTER_MS = 40_000;

function pngPlan(bounds: Rect) {
  const naturalWidth = Math.max(1, bounds.width + PADDING * 2);
  const naturalHeight = Math.max(1, bounds.height + PADDING * 2);
  const scale = Math.min(
    1,
    MAX_CANVAS_SIDE / naturalWidth,
    MAX_CANVAS_SIDE / naturalHeight,
    Math.sqrt(MAX_CANVAS_PIXELS / (naturalWidth * naturalHeight)),
  );
  const width = Math.max(1, Math.floor(naturalWidth * scale));
  const height = Math.max(1, Math.floor(naturalHeight * scale));
  const pixelRatio = Math.max(
    1,
    Math.min(
      MAX_RATIO,
      MAX_CANVAS_SIDE / width,
      MAX_CANVAS_SIDE / height,
      Math.sqrt(MAX_CANVAS_PIXELS / (width * height)),
    ),
  );
  const padding = `${PADDING * scale}px` as const;
  return {
    width,
    height,
    pixelRatio,
    viewport: getViewportForBounds(bounds, width, height, 0.001, 1, {
      x: padding,
      y: padding,
    }),
  };
}

export function pngFilename(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "graphql"}-schema.png`;
}

const PAINT = [
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "fill",
  "fill-opacity",
];

/** html-to-image keeps an SVG element's inline style but not the paint its
 * stylesheet gives it, so edges and arrows would vanish from the image. */
async function withInlinePaint<T>(
  root: HTMLElement,
  capture: () => Promise<T>,
) {
  const saved = [...root.querySelectorAll<SVGElement>("svg *")].map(
    (element) => {
      const style = element.getAttribute("style");
      const computed = getComputedStyle(element);
      for (const property of PAINT) {
        element.style.setProperty(
          property,
          computed.getPropertyValue(property),
        );
      }
      return { element, style };
    },
  );
  try {
    return await capture();
  } finally {
    for (const { element, style } of saved) {
      if (style === null) element.removeAttribute("style");
      else element.setAttribute("style", style);
    }
  }
}

export async function renderPng({
  viewport,
  bounds,
  background,
}: {
  viewport: HTMLElement;
  bounds: Rect;
  background: string;
}): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const plan = pngPlan(bounds);
  const blob = await withInlinePaint(viewport, () =>
    toBlob(viewport, {
      backgroundColor: background,
      width: plan.width,
      height: plan.height,
      pixelRatio: plan.pixelRatio,
      style: {
        width: `${plan.width}px`,
        height: `${plan.height}px`,
        transform: `translate(${plan.viewport.x}px, ${plan.viewport.y}px) scale(${plan.viewport.zoom})`,
        transformOrigin: "0 0",
      },
    }),
  );
  if (!blob) throw new Error("The browser could not make the image.");
  return blob;
}

export async function downloadPng(image: Promise<Blob>, filename: string) {
  const url = URL.createObjectURL(await image);
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** Calls `clipboard.write` inside the click, with the image as a promise, so
 * the write keeps the click's user activation in browsers that ask for it. */
export function copyPng(render: () => Promise<Blob>): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    return Promise.reject(
      new Error(
        "Copying an image needs clipboard access over https or localhost.",
      ),
    );
  }
  try {
    return navigator.clipboard.write([
      new ClipboardItem({ "image/png": render() }),
    ]);
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
