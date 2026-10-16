import fs from "node:fs";
import path from "node:path";

/**
 * Project icons (proof of concept). Host files and powerhouse.config.json
 * name icons as project-relative paths; the browser cannot read those, so
 * the runners resolve them here into data URIs before Connect or a drive
 * sees them. URLs and data URIs pass through unchanged.
 */

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

const PASSTHROUGH = /^(data:|https?:|blob:|\/\/)/i;

/** The favicon sizes found next to an app master by naming convention. */
export const APP_ICON_VARIANT_SIZES = [16, 32, 64] as const;

export interface IconResolveOptions {
  /** Refuse files larger than this (bytes). Synced drive icons need it. */
  maxBytes?: number;
  /** Where warnings go (missing files, oversize). */
  warn?: (message: string) => void;
}

/** A project-relative path → data URI; URLs/data URIs unchanged; a missing
 * or oversize file → undefined (with a warning), so a bad icon never breaks
 * a boot. */
export function resolveImageRef(
  projectRoot: string,
  ref: string | undefined | null,
  options: IconResolveOptions = {},
): string | undefined {
  if (!ref) return undefined;
  if (PASSTHROUGH.test(ref)) return ref;
  const file = path.resolve(projectRoot, ref);
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) {
    options.warn?.(`[icons] unsupported image type, skipped: ${ref}`);
    return undefined;
  }
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    options.warn?.(`[icons] file not found, skipped: ${ref}`);
    return undefined;
  }
  if (options.maxBytes !== undefined && bytes.length > options.maxBytes) {
    options.warn?.(
      `[icons] ${ref} is ${bytes.length} bytes (limit ${options.maxBytes}); use a smaller variant (e.g. _64x64). Skipped.`,
    );
    return undefined;
  }
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** The `<name>_<n>x<n>.<ext>` sibling of a master, if it exists. */
export function iconVariantPath(
  projectRoot: string,
  master: string,
  size: number,
): string | undefined {
  if (PASSTHROUGH.test(master)) return undefined;
  const ext = path.extname(master);
  const candidate = `${master.slice(0, master.length - ext.length)}_${size}x${size}${ext}`;
  return fs.existsSync(path.resolve(projectRoot, candidate))
    ? candidate
    : undefined;
}

/** Drive icons live in synced document state: keep them small. */
export const DRIVE_ICON_MAX_BYTES = 64 * 1024;
/** UI-only icons (runtime config): generous, but not a 1 MB master. */
export const UI_ICON_MAX_BYTES = 256 * 1024;

export interface ResolvedIcons {
  app?: string;
  appVariants?: { size: number; src: string }[];
  localDrive?: string;
  remoteDrive?: string;
  folder?: string;
  document?: string;
  documents?: Record<string, string>;
  drives?: Record<string, string>;
}

/**
 * Resolve a project icon set for the Connect runtime config. `app` becomes
 * the 64 px variant (the in-app logo; the master would be ~1 MB of base64)
 * and `appVariants` carries every favicon size found on disk. `drives` is
 * dropped: drive icons travel through the drive declarations instead.
 */
export function resolveConnectIcons(
  projectRoot: string,
  icons: Record<string, unknown> | undefined,
  warn?: (message: string) => void,
): ResolvedIcons | undefined {
  if (!icons) return undefined;
  const ui = { maxBytes: UI_ICON_MAX_BYTES, warn };
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const out: ResolvedIcons = {};
  const app = str(icons.app);
  if (app) {
    const variants: { size: number; src: string }[] = [];
    for (const size of APP_ICON_VARIANT_SIZES) {
      const variant = iconVariantPath(projectRoot, app, size);
      const src = variant
        ? resolveImageRef(projectRoot, variant, ui)
        : undefined;
      if (src) variants.push({ size, src });
    }
    if (variants.length > 0) out.appVariants = variants;
    out.app =
      variants.find((v) => v.size === 64)?.src ??
      resolveImageRef(projectRoot, app, ui);
  }
  for (const key of [
    "localDrive",
    "remoteDrive",
    "folder",
    "document",
  ] as const) {
    const src = resolveImageRef(projectRoot, str(icons[key]), ui);
    if (src) out[key] = src;
  }
  const documents = icons.documents as Record<string, unknown> | undefined;
  if (documents && typeof documents === "object") {
    const resolved: Record<string, string> = {};
    for (const [type, ref] of Object.entries(documents)) {
      const src = resolveImageRef(projectRoot, str(ref), ui);
      if (src) resolved[type] = src;
    }
    if (Object.keys(resolved).length > 0) out.documents = resolved;
  }
  return out;
}
