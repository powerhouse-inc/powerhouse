import type {
  PHConnectIcons,
  PHConnectLoader,
} from "@powerhousedao/shared/clis";
import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import type { Connect, Plugin } from "vite";

// Project branding that must be in place before any JavaScript runs, so it
// cannot wait for the runtime config: the loading animation (index.html and
// the prerendered shell) and the installed app's name and icons (the web-app
// manifest). Both come from powerhouse.config.json — `icons.loader`,
// `icons.app` and `connect.branding.appName` — and the files are emitted
// next to index.html, the way connectFaviconPlugin emits icon.ico.

/** `<meta name>` that tells Connect's loaders which image replaces the logo. */
export const LOADER_META = "ph-loader";
/** `<meta name>` set when the project's `_app` replaces Connect's layout. */
export const CUSTOM_SHELL_META = "ph-custom-shell";

const DEFAULT_LOADER_SIZE = 96;

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

type Warn = (message: string) => void;

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
  if (/^(data:|https?:|blob:|\/\/)/i.test(ref)) {
    warn?.(`[brand] ${ref}: use a project file path here, not a URL. Skipped.`);
    return undefined;
  }
  const file = projectFile(projectRoot, ref);
  const ext = extname(file).toLowerCase();
  const contentType = IMAGE_TYPES[ext];
  if (!contentType) {
    warn?.(`[brand] ${ref}: unsupported image type. Skipped.`);
    return undefined;
  }
  if (!existsSync(file)) {
    warn?.(`[brand] ${ref}: file not found. Skipped.`);
    return undefined;
  }
  return { fileName: fileName(ext), file, contentType };
}

/** `icons.loader` as the build emits it; undefined keeps Connect's logo. */
export function resolveProjectLoader(
  projectRoot: string,
  icons: PHConnectIcons | undefined,
  warn?: Warn,
): ProjectLoader | undefined {
  const loader = icons?.loader;
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

/** The sizes installers look for, found next to the app master by the same
 * `<name>_<n>x<n>.png` convention as the favicon variants. */
const PWA_ICON_SIZES = [192, 512] as const;

/** The installed app's name and icons, from `connect.branding.appName` and
 * `icons.app`. Undefined members keep Connect's own. */
export function resolveProjectPwaBrand(
  projectRoot: string,
  config: {
    icons?: PHConnectIcons;
    connect?: { branding?: { appName?: string } };
  },
  warn?: Warn,
): ProjectPwaBrand {
  const brand: ProjectPwaBrand = {};
  const name = config.connect?.branding?.appName?.trim();
  if (name) brand.name = name;

  const app = config.icons?.app;
  if (!app) return brand;
  const ext = extname(app).toLowerCase();
  if (ext === ".svg") {
    const svg = asset(projectRoot, app, () => "pwa-app.svg", warn);
    if (svg) brand.icons = [{ ...svg, sizes: "any" }];
    return brand;
  }
  if (ext !== ".png") {
    warn?.(
      `[brand] icons.app ${app}: the installed-app icon needs a PNG or SVG. Connect's icon stays.`,
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
  for (const size of PWA_ICON_SIZES) add(`${stem}_${size}x${size}${ext}`);
  add(app);
  if (icons.length === 0) {
    warn?.(
      `[brand] icons.app ${app}: not a readable PNG. Connect's icon stays.`,
    );
    return brand;
  }
  brand.icons = icons;
  return brand;
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
 * Serves (dev) and emits (build) the project's brand files, and adds the
 * meta tags Connect's loaders read. Before any JavaScript: the tags sit in
 * index.html, the files next to it.
 */
export function connectProjectBrandPlugin(options: {
  loader?: ProjectLoader;
  pwaIcons?: PwaIcon[];
  customShell?: boolean;
}): Plugin {
  const files: ProjectAsset[] = [
    ...(options.loader ? [options.loader] : []),
    ...(options.pwaIcons ?? []),
  ];
  const meta = brandMetaTags(options);
  return {
    name: "ph-connect-project-brand",
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
        const base = server.config.base;
        const paths = new Set([
          `${base}${file.fileName}`.replace(/\/{2,}/g, "/"),
          `/${file.fileName}`,
        ]);
        for (const path of paths) server.middlewares.use(path, handler);
      }
    },
    transformIndexHtml(html) {
      return meta ? html.replace("</head>", `${meta}</head>`) : html;
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
          // A file that vanished mid-build: the loader falls back to Connect's.
        }
      }
    },
  };
}
