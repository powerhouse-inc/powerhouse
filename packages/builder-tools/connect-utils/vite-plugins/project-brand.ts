import type {
  PHBackground,
  PHConnectBranding,
  PHConnectCompositionEntry,
  PHConnectExplorerIcons,
  PHConnectLoader,
  PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import {
  DEFAULT_CONNECT_CONFIG,
  mapBackgroundImages,
  validateBackground,
} from "@powerhousedao/shared/connect";
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
//    data URI, which Connect reads at boot (the in-app logo).
//
// The drive explorer's icons (`drives.icons`) and the home screen's
// background (`home.background`) are the generic chrome's, owned by the
// generic plugin; the same resolution is applied to them below.
// `null` on any field means the default, the same as omitting it. A path is
// resolved here, at build or dev-server start; config applied later (deploy
// overrides, packages loaded in the browser) uses URLs or data URIs, which
// pass through everywhere.

/** `<meta name>` that tells Connect's loaders which image replaces the logo. */
export const LOADER_META = "ph-loader";
/** `<meta name>` set when the project's `_app` replaces Connect's layout. */
export const CUSTOM_SHELL_META = "ph-custom-shell";
/** The plugin whose entry config carries the explorer icons. */
export const GENERIC_PLUGIN_MODULE = "@powerhousedao/connect/plugins/generic";

const DEFAULT_LOADER_SIZE = 96;
const DEFAULT_BRANDING: PHConnectBranding =
  DEFAULT_CONNECT_CONFIG.branding ?? {};

type Warn = (message: string) => void;

/**
 * The branding in effect: defaults < source powerhouse.config.json <
 * CLI / host override, applied in that order. In every layer `undefined`
 * leaves the field alone and `null` resets it to the default, so a null in a
 * later layer beats a value in an earlier one. Keys branding does not have
 * (a `homeBackground` from before it moved to `connect.home`) are dropped.
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
      if (value === undefined || !(key in defaults)) continue;
      out[key] = value === null ? (defaults[key] ?? null) : value;
    }
  }
  const appName =
    typeof out.appName === "string" ? out.appName.trim() : undefined;
  out.appName = appName || DEFAULT_BRANDING.appName;
  return out as PHConnectBranding;
}

/**
 * The `branding` block Connect reads at boot: the app icon reduced to its
 * 64 px variant as a data URI (the in-app logo; a master would be ~1 MB of
 * base64), the loader left out (it is served as a file and declared in
 * index.html). Fields without a usable image end up null.
 */
export function resolveRuntimeBranding(
  projectRoot: string,
  branding: PHConnectBranding,
  warn?: Warn,
): PHConnectBranding {
  const out: PHConnectBranding = {
    appName: branding.appName ?? DEFAULT_BRANDING.appName,
    icon: null,
    loader: null,
  };
  if (branding.icon) {
    const logo = iconVariantPath(projectRoot, branding.icon, 64);
    out.icon =
      resolveImageRef(projectRoot, logo ?? branding.icon, {
        maxBytes: UI_ICON_MAX_BYTES,
        warn,
      }) ?? null;
  }
  return out;
}

/**
 * A pane's background with every image, in both colour schemes, resolved to
 * a data URI: a single image stays a single image, layers stay layers (a
 * layer without a usable image is dropped). Problems the renderer cannot
 * fix are warned about: a layer pinned to both edges of an axis, an SVG
 * without a viewBox (its aspect is unknown, so it needs both dimensions).
 */
export function resolveBackground(
  projectRoot: string,
  background: PHBackground | null | undefined,
  warn?: Warn,
): PHBackground | null {
  if (!background) return null;
  for (const problem of validateBackground(background, "homeBackground")) {
    warn?.(`[branding] ${problem}`);
  }
  const resolveOne = (ref: string) => {
    if (!isPassthroughImageRef(ref) && extname(ref).toLowerCase() === ".svg") {
      warnWithoutViewBox(projectRoot, ref, warn);
    }
    return resolveImageRef(projectRoot, ref, {
      maxBytes: BACKGROUND_MAX_BYTES,
      warn,
    });
  };
  if (typeof background === "string") return resolveOne(background) ?? null;
  return mapBackgroundImages(background, resolveOne);
}

function warnWithoutViewBox(projectRoot: string, ref: string, warn?: Warn) {
  const file = resolve(projectRoot, ref);
  if (!existsSync(file)) return; // resolveImageRef reports the missing file
  const head = readFileSync(file, "utf8").slice(0, 4096);
  if (!/<svg[^>]*\sviewBox\s*=/i.test(head)) {
    warn?.(
      `[branding] ${ref} has no viewBox, so its aspect is unknown: give the layer both width and height.`,
    );
  }
}

const EXPLORER_ICON_KEYS = [
  "localDrive",
  "remoteDrive",
  "folder",
  "document",
] as const;

/**
 * The drive explorer's icons with every path resolved to a data URI; a key
 * without a usable image is dropped (the built-in icon), an empty or null
 * set is null.
 */
export function resolveExplorerIcons(
  projectRoot: string,
  icons: PHConnectExplorerIcons | null | undefined,
  warn?: Warn,
): PHConnectExplorerIcons | null {
  if (!icons) return null;
  const ui = { maxBytes: UI_ICON_MAX_BYTES, warn };
  const out: PHConnectExplorerIcons = {};
  for (const key of EXPLORER_ICON_KEYS) {
    const src = resolveImageRef(projectRoot, icons[key], ui);
    if (src) out[key] = src;
  }
  if (icons.documents) {
    const documents: Record<string, string> = {};
    for (const [type, ref] of Object.entries(icons.documents)) {
      const src = resolveImageRef(projectRoot, ref, ui);
      if (src) documents[type] = src;
    }
    if (Object.keys(documents).length > 0) out.documents = documents;
  }
  return Object.keys(out).length > 0 ? out : null;
}

type GenericEntry = PHConnectCompositionEntry & {
  config: {
    icons?: PHConnectExplorerIcons | null;
    homeBackground?: PHBackground | null;
  };
};

/** A generic plugin entry whose config carries images to resolve. */
function hasGenericImages(
  entry: PHConnectCompositionEntry,
): entry is GenericEntry {
  return (
    entry.module === GENERIC_PLUGIN_MODULE &&
    entry.config !== undefined &&
    ("icons" in entry.config || "homeBackground" in entry.config)
  );
}

/**
 * A connect block with the generic plugin's images resolved, wherever they
 * are declared: `drives.icons` and `home.background` (the classic source
 * values) and the generic plugin entry's `icons` / `homeBackground` in a
 * served composition (the owner under uniform runners). Unchanged when none
 * is present.
 */
export function withResolvedGenericImages<
  T extends PHConnectRuntimeConfig | undefined,
>(projectRoot: string, connect: T, warn?: Warn): T {
  if (!connect) return connect;
  let out: PHConnectRuntimeConfig = connect;
  if (connect.drives && "icons" in connect.drives) {
    out = {
      ...out,
      drives: {
        ...out.drives,
        icons: resolveExplorerIcons(projectRoot, connect.drives.icons, warn),
      },
    };
  }
  if (connect.home && "background" in connect.home) {
    out = {
      ...out,
      home: {
        ...out.home,
        background: resolveBackground(
          projectRoot,
          connect.home.background,
          warn,
        ),
      },
    };
  }
  if (connect.composition?.some(hasGenericImages)) {
    out = {
      ...out,
      composition: connect.composition.map((entry) => {
        if (!hasGenericImages(entry)) return entry;
        const config = { ...entry.config };
        if ("icons" in config) {
          config.icons = resolveExplorerIcons(projectRoot, config.icons, warn);
        }
        if ("homeBackground" in config) {
          config.homeBackground = resolveBackground(
            projectRoot,
            config.homeBackground,
            warn,
          );
        }
        return { ...entry, config };
      }),
    };
  }
  return out as T;
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
 * Connect's static icon.ico link in index.html; none keeps it. A favicon
 * named outright (`faviconPath`: `branding.favicon` or `--favicon`) wins: it
 * is built as icon.ico, so the icon's siblings stand aside.
 */
export function resolveProjectFavicons(
  projectRoot: string,
  branding: PHConnectBranding | undefined,
  warn?: Warn,
  faviconPath?: string,
): ProjectFavicon[] {
  const app = branding?.icon;
  if (!app || faviconPath) return [];
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
