import type {
  PHConnectBranding,
  PHConnectBrandingIcons,
  PHConnectLoader,
} from "@powerhousedao/shared/clis";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import {
  APP_ICON_VARIANT_SIZES,
  BACKGROUND_MAX_BYTES,
  PWA_ICON_VARIANT_SIZES,
  UI_ICON_MAX_BYTES,
  iconVariantPath,
  imageMimeType,
  isPassthroughImageRef,
  resolveImageRef,
} from "@powerhousedao/shared/connect/image-ref";
import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import type { Connect, Plugin } from "vite";

// `connect.branding` is a core setting of the Connect host: this module owns
// turning it into what the browser needs, for `ph connect` and `ph run connect`
// alike, since both build their Vite config here. Two kinds of output:
//
//  - before any JavaScript runs (index.html, the prerendered shell, the web
//    manifest): the loader image, the favicons and the installed app's name
//    and icons, emitted next to index.html the way connectFaviconPlugin emits
//    icon.ico and declared in <meta> / <link> tags;
//  - the runtime config's `branding` block, with every image resolved to a
//    data URI, which Connect reads at boot (in-app logo, home background,
//    explorer icons).
//
// `null` on any field means the default, the same as omitting it.

/** `<meta name>` that tells Connect's loaders which image replaces the logo. */
export const LOADER_META = "ph-loader";
/** `<meta name>` set when the project's `_app` replaces Connect's layout. */
export const CUSTOM_SHELL_META = "ph-custom-shell";

const DEFAULT_LOADER_SIZE = 96;
const DEFAULT_BRANDING: PHConnectBranding =
  DEFAULT_CONNECT_CONFIG.branding ?? {};

type Warn = (message: string) => void;

type IconsKey = keyof PHConnectBrandingIcons;

/**
 * The branding in effect: defaults < source powerhouse.config.json <
 * CLI / host override, applied in that order. In every layer `undefined`
 * leaves the field alone and `null` resets it to the default, so a null in a
 * later layer beats a value in an earlier one (`--home-background ""`).
 * `icons` merges per key the same way.
 */
export function effectiveBranding(
  ...layers: Array<PHConnectBranding | null | undefined>
): PHConnectBranding {
  const out: Record<string, unknown> = { ...DEFAULT_BRANDING };
  const defaults = DEFAULT_BRANDING as Record<string, unknown>;
  for (const layer of layers) {
    if (!layer) continue;
    const entries = Object.entries(layer) as Array<[string, unknown]>;
    for (const [key, value] of entries) {
      if (value === undefined) continue;
      if (value === null) {
        out[key] = defaults[key] ?? null;
        continue;
      }
      if (key === "icons" && typeof value === "object") {
        const merged: Record<string, unknown> = {
          ...((out.icons as Record<string, unknown> | null | undefined) ?? {}),
        };
        for (const [iconKey, iconValue] of Object.entries(value as object)) {
          if (iconValue === undefined) continue;
          if (iconValue === null) delete merged[iconKey];
          else merged[iconKey] = iconValue;
        }
        out.icons = Object.keys(merged).length > 0 ? merged : null;
        continue;
      }
      out[key] = value;
    }
  }
  const appName =
    typeof out.appName === "string" ? out.appName.trim() : undefined;
  out.appName = appName || DEFAULT_BRANDING.appName;
  return out as PHConnectBranding;
}

/**
 * The `branding` block Connect reads at boot: paths resolved to data URIs,
 * the app icon reduced to its 64 px variant (the in-app logo; a master would
 * be ~1 MB of base64), the loader left out (it is served as a file and
 * declared in index.html). Fields without a usable image end up null.
 */
export function resolveRuntimeBranding(
  projectRoot: string,
  branding: PHConnectBranding,
  warn?: Warn,
): PHConnectBranding {
  const ui = { maxBytes: UI_ICON_MAX_BYTES, warn };
  const out: PHConnectBranding = {
    appName: branding.appName ?? DEFAULT_BRANDING.appName,
    homeBackground:
      resolveImageRef(projectRoot, branding.homeBackground, {
        maxBytes: BACKGROUND_MAX_BYTES,
        warn,
      }) ?? null,
    icon: null,
    loader: null,
    icons: null,
  };
  if (branding.icon) {
    const logo = iconVariantPath(projectRoot, branding.icon, 64);
    out.icon = resolveImageRef(projectRoot, logo ?? branding.icon, ui) ?? null;
  }
  const icons = branding.icons;
  if (icons) {
    const resolved: PHConnectBrandingIcons = {};
    for (const key of [
      "localDrive",
      "remoteDrive",
      "folder",
      "document",
    ] as const satisfies readonly IconsKey[]) {
      const src = resolveImageRef(projectRoot, icons[key], ui);
      if (src) resolved[key] = src;
    }
    if (icons.documents) {
      const documents: Record<string, string> = {};
      for (const [type, ref] of Object.entries(icons.documents)) {
        const src = resolveImageRef(projectRoot, ref, ui);
        if (src) documents[type] = src;
      }
      if (Object.keys(documents).length > 0) resolved.documents = documents;
    }
    if (Object.keys(resolved).length > 0) out.icons = resolved;
  }
  return out;
}

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export type ProjectAsset = {
  /** Emitted next to index.html under this name. */
  fileName: string;
  /** Absolute source file. */
  file: string;
  contentType: string;
};

export type ProjectLoader = ProjectAsset & {
  animation: NonNullable<PHConnectLoader["animation"]>;
  size: number;
};

function projectFile(projectRoot: string, ref: string) {
  return isAbsolute(ref) ? ref : resolve(projectRoot, ref);
}

function asset(
  projectRoot: string,
  ref: string,
  fileName: (ext: string) => string,
  warn?: Warn,
): ProjectAsset | undefined {
  // URLs and data URIs are not files to emit; the build-time brand takes paths.
  if (isPassthroughImageRef(ref)) {
    warn?.(
      `[branding] ${ref}: use a project file path here, not a URL. Skipped.`,
    );
    return undefined;
  }
  const file = projectFile(projectRoot, ref);
  const ext = extname(file).toLowerCase();
  const contentType = IMAGE_TYPES[ext];
  if (!contentType) {
    warn?.(`[branding] ${ref}: unsupported image type. Skipped.`);
    return undefined;
  }
  if (!existsSync(file)) {
    warn?.(`[branding] ${ref}: file not found. Skipped.`);
    return undefined;
  }
  return { fileName: fileName(ext), file, contentType };
}

/** `branding.loader` as the build emits it; undefined keeps Connect's logo. */
export function resolveProjectLoader(
  projectRoot: string,
  branding: PHConnectBranding | undefined,
  warn?: Warn,
): ProjectLoader | undefined {
  const loader = branding?.loader;
  if (!loader) return undefined;
  const spec = typeof loader === "string" ? { src: loader } : loader;
  const found = asset(projectRoot, spec.src, (ext) => `ph-loader${ext}`, warn);
  if (!found) return undefined;
  return {
    ...found,
    animation: spec.animation ?? "pulse",
    size: spec.size ?? DEFAULT_LOADER_SIZE,
  };
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(bytes: Uint8Array): [number, number] | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

export type PwaIcon = ProjectAsset & { sizes: string };

export type ProjectPwaBrand = {
  name?: string;
  /** Replace Connect's manifest icons (Connect's maskable one included). */
  icons?: PwaIcon[];
};

/** The installed app's name and icons, from `branding.appName` and
 * `branding.icon`. Undefined members keep Connect's own. */
export function resolveProjectPwaBrand(
  projectRoot: string,
  branding: PHConnectBranding | undefined,
  warn?: Warn,
): ProjectPwaBrand {
  const brand: ProjectPwaBrand = {};
  const name = branding?.appName?.trim();
  if (name && name !== DEFAULT_BRANDING.appName) brand.name = name;

  const app = branding?.icon;
  if (!app) return brand;
  const ext = extname(app).toLowerCase();
  if (ext === ".svg") {
    const svg = asset(projectRoot, app, () => "pwa-app.svg", warn);
    if (svg) brand.icons = [{ ...svg, sizes: "any" }];
    return brand;
  }
  if (ext !== ".png") {
    warn?.(
      `[branding] icon ${app}: the installed-app icon needs a PNG or SVG. Connect's icon stays.`,
    );
    return brand;
  }
  const icons: PwaIcon[] = [];
  const seen = new Set<string>();
  const add = (ref: string) => {
    const file = projectFile(projectRoot, ref);
    if (!existsSync(file)) return;
    const size = pngSize(readFileSync(file));
    if (!size) return;
    const sizes = `${size[0]}x${size[1]}`;
    if (seen.has(sizes)) return;
    seen.add(sizes);
    icons.push({
      fileName: `pwa-app-${sizes}.png`,
      file,
      contentType: "image/png",
      sizes,
    });
  };
  const stem = app.slice(0, app.length - ext.length);
  for (const size of PWA_ICON_VARIANT_SIZES)
    add(`${stem}_${size}x${size}${ext}`);
  add(app);
  if (icons.length === 0) {
    warn?.(`[branding] icon ${app}: not a readable PNG. Connect's icon stays.`);
    return brand;
  }
  brand.icons = icons;
  return brand;
}

export type ProjectFavicon = ProjectAsset & {
  /** `<link sizes>`: "16x16", or "any" for an SVG. */
  sizes: string;
};

/**
 * The favicons: the `_16x16` / `_32x32` / `_64x64` siblings of
 * `branding.icon` (an SVG master is one scalable favicon). They replace
 * Connect's static icon.ico link in index.html; none keeps it.
 */
export function resolveProjectFavicons(
  projectRoot: string,
  branding: PHConnectBranding | undefined,
  warn?: Warn,
): ProjectFavicon[] {
  const app = branding?.icon;
  if (!app) return [];
  if (isPassthroughImageRef(app)) {
    warn?.(
      `[branding] icon ${app}: use a project file path here, not a URL. Connect's favicon stays.`,
    );
    return [];
  }
  const ext = extname(app).toLowerCase();
  if (ext === ".svg") {
    const svg = asset(projectRoot, app, () => "favicon.svg", warn);
    return svg ? [{ ...svg, sizes: "any" }] : [];
  }
  const out: ProjectFavicon[] = [];
  for (const size of APP_ICON_VARIANT_SIZES) {
    const variant = iconVariantPath(projectRoot, app, size);
    if (!variant) continue;
    const file = projectFile(projectRoot, variant);
    const contentType = imageMimeType(file);
    if (!contentType) continue;
    out.push({
      fileName: `favicon-${size}x${size}${ext}`,
      file,
      contentType,
      sizes: `${size}x${size}`,
    });
  }
  if (out.length === 0) {
    warn?.(
      `[branding] icon ${app}: no _16x16 / _32x32 / _64x64 siblings found. Connect's favicon stays.`,
    );
  }
  return out;
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** The `<meta>` tags Connect's loaders read. */
export function brandMetaTags(options: {
  loader?: ProjectLoader;
  customShell?: boolean;
}): string {
  const tags: string[] = [];
  const { loader } = options;
  if (loader) {
    tags.push(
      `<meta name="${LOADER_META}" content="${escapeAttr(loader.fileName)}" data-animation="${loader.animation}" data-size="${loader.size}">`,
    );
  }
  if (options.customShell) {
    tags.push(`<meta name="${CUSTOM_SHELL_META}" content="true">`);
  }
  return tags.join("");
}

const ICON_LINK = /<link\b[^>]*\brel=["']?(?:shortcut )?icon["']?[^>]*>\s*/gi;

/** index.html with Connect's icon links replaced by the project's favicons
 * (one sized link per variant, under `base`); unchanged without any. */
export function withProjectFavicons(
  html: string,
  favicons: ProjectFavicon[],
  base = "/",
): string {
  if (favicons.length === 0) return html;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const links = favicons
    .map(
      (icon) =>
        `<link rel="icon" type="${icon.contentType}" sizes="${icon.sizes}" href="${escapeAttr(prefix + icon.fileName)}" />`,
    )
    .join("");
  return html.replace(ICON_LINK, "").replace("</head>", `${links}</head>`);
}

/** Keyframes for the loader motions; shared by the shell and the app. */
export const LOADER_KEYFRAMES =
  "@keyframes ph-loader-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.94)}}" +
  "@keyframes ph-loader-spin{to{transform:rotate(360deg)}}";

const LOADER_ANIMATION = {
  pulse: "ph-loader-pulse 1.6s ease-in-out infinite",
  spin: "ph-loader-spin 1.4s linear infinite",
  none: "none",
} as const;

/** The loader as static markup, for the prerendered shell's first paint. */
export function loaderMarkup(loader: ProjectLoader, base = "/"): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const motion = LOADER_ANIMATION[loader.animation];
  return (
    `<style>${LOADER_KEYFRAMES}@media (prefers-reduced-motion:reduce){[data-ph-loader-img]{animation:none!important}}</style>` +
    `<img data-ph-loader-img src="${escapeAttr(prefix + loader.fileName)}" alt="" width="${loader.size}" style="width:${loader.size}px;height:auto;animation:${motion}">`
  );
}

/** The marked slot in Connect's prerendered shell that holds its logo. */
const LOADER_SLOT = /<div\b[^>]*\bdata-ph-loader-slot\b[^>]*>[\s\S]*?<\/div>/;

/** Swaps the shell's logo slot for the project's loader. */
export function replaceShellLoader(
  shellBody: string,
  loader: ProjectLoader,
  base = "/",
): string {
  return shellBody.replace(LOADER_SLOT, () => loaderMarkup(loader, base));
}

/**
 * Serves (dev) and emits (build) the branding files, and adds the tags
 * index.html carries before any JavaScript: the loader and custom-shell
 * meta tags, and the favicon links.
 */
export function connectProjectBrandPlugin(options: {
  loader?: ProjectLoader;
  pwaIcons?: PwaIcon[];
  favicons?: ProjectFavicon[];
  customShell?: boolean;
}): Plugin {
  const favicons = options.favicons ?? [];
  const files: ProjectAsset[] = [
    ...(options.loader ? [options.loader] : []),
    ...(options.pwaIcons ?? []),
    ...favicons,
  ];
  const meta = brandMetaTags(options);
  let base = "/";
  return {
    name: "ph-connect-project-brand",
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      for (const file of files) {
        const handler: Connect.NextHandleFunction = (_req, res, next) => {
          try {
            res.setHeader("Content-Type", file.contentType);
            res.end(readFileSync(file.file));
          } catch {
            next();
          }
        };
        const paths = new Set([
          `${server.config.base}${file.fileName}`.replace(/\/{2,}/g, "/"),
          `/${file.fileName}`,
        ]);
        for (const path of paths) server.middlewares.use(path, handler);
      }
    },
    transformIndexHtml(html) {
      const withMeta = meta ? html.replace("</head>", `${meta}</head>`) : html;
      return withProjectFavicons(withMeta, favicons, base);
    },
    generateBundle(_options, bundle) {
      for (const file of files) {
        if (file.fileName in bundle) continue;
        try {
          this.emitFile({
            type: "asset",
            fileName: file.fileName,
            source: readFileSync(file.file),
          });
        } catch {
          // A file that vanished mid-build: Connect's own asset stays.
        }
      }
    },
  };
}
