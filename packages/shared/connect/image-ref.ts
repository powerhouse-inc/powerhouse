import fs from "node:fs";
import path from "node:path";

/**
 * Image references (node side). Config files name images as project-relative
 * paths; the browser cannot read those, so the Connect build / dev server
 * (branding) and host-core (drive declarations) resolve them here into data
 * URIs before anything in the browser sees them. URLs and data URIs pass
 * through unchanged. Not part of the browser barrel: it reads the file system.
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

/** A reference that is already usable by the browser (URL or data URI). */
export function isPassthroughImageRef(ref: string): boolean {
  return PASSTHROUGH.test(ref);
}

/** The media type an image file's extension implies, if supported. */
export function imageMimeType(file: string): string | undefined {
  return MIME[path.extname(file).toLowerCase()];
}

/** The favicon sizes found next to an app icon master by naming convention. */
export const APP_ICON_VARIANT_SIZES = [16, 32, 64] as const;
/** The installed-app (web manifest) sizes, by the same convention. */
export const PWA_ICON_VARIANT_SIZES = [192, 512] as const;

/** Drive icons live in synced document state: keep them small. */
export const DRIVE_ICON_MAX_BYTES = 64 * 1024;
/** UI icons embedded in the runtime config: generous, but not a 1 MB master. */
export const UI_ICON_MAX_BYTES = 256 * 1024;
/** A background image is fetched once with the runtime config. */
export const BACKGROUND_MAX_BYTES = 1024 * 1024;

export interface ImageRefOptions {
  /** Refuse files larger than this (bytes). */
  maxBytes?: number;
  /** Where warnings go (missing files, oversize, unsupported type). */
  warn?: (message: string) => void;
}

/**
 * A project-relative path → data URI; URLs and data URIs unchanged; a
 * missing, unsupported or oversize file → undefined (with a warning), so a
 * bad image never breaks a boot or a build.
 */
export function resolveImageRef(
  projectRoot: string,
  ref: string | undefined | null,
  options: ImageRefOptions = {},
): string | undefined {
  if (!ref) return undefined;
  if (PASSTHROUGH.test(ref)) return ref;
  const file = path.resolve(projectRoot, ref);
  const mime = imageMimeType(file);
  if (!mime) {
    options.warn?.(`[branding] unsupported image type, skipped: ${ref}`);
    return undefined;
  }
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    options.warn?.(`[branding] file not found, skipped: ${ref}`);
    return undefined;
  }
  if (options.maxBytes !== undefined && bytes.length > options.maxBytes) {
    options.warn?.(
      `[branding] ${ref} is ${bytes.length} bytes (limit ${options.maxBytes}); use a smaller variant (e.g. _64x64). Skipped.`,
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
