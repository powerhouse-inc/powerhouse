import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { deepMerge, normalizeBasePath } from "@powerhousedao/shared/connect";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sirv from "sirv";
import type { InlineConfig, Plugin } from "vite";
import { mergeConfig, preview } from "vite";
import type { ConnectPreviewArgs } from "../types.js";
import { PRECOMPRESS_EXTENSIONS } from "../utils/precompress.js";

/**
 * Runtime shaping for a served (built) Connect, desktop shape: the compound
 * projects the live switchboard's drive into the connect member's config, and
 * this override makes the STATIC dist serve it — the built
 * powerhouse.config.json is baked, so without this the drive injection never
 * reaches the SPA. `cspRegistrySync` additionally patches the baked CSP's
 * script-src with the runtime registry (the build bakes the CSP for the
 * registry it was built against; setting the registry at run time breaks that
 * coupling and every package import gets blocked otherwise).
 */
export interface ConnectServeOverride {
  connect?: PHConnectRuntimeConfig;
  cspRegistrySync?: boolean;
  /** Overrides the baked top-level packageRegistryUrl in the served config. */
  packageRegistryUrl?: string;
}

/**
 * The env contract a supervisor can drive the preview with — the same
 * variables the Docker entrypoint and clint's service manager already speak:
 * PH_CONNECT_DEFAULT_DRIVES_URL (comma-separated drive urls, injected into
 * drives.defaultDrives), PH_CONNECT_DRIVES_PRESERVE_STRATEGY, and
 * PH_CONNECT_PACKAGES_REGISTRY (runtime registry: served config + baked-CSP
 * patch). Lets `ph connect preview` replace hand-rolled static servers
 * (clint's connect-server, the ph-win sidecar) without losing injection.
 */
export function overrideFromEnv(
  env: Record<string, string | undefined> = process.env,
): ConnectServeOverride | undefined {
  const drivesUrl = env.PH_CONNECT_DEFAULT_DRIVES_URL;
  const registry = env.PH_CONNECT_PACKAGES_REGISTRY;
  if (!drivesUrl && !registry) return undefined;
  const override: ConnectServeOverride = {};
  if (drivesUrl) {
    override.connect = {
      drives: {
        defaultDrives: drivesUrl
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((url) => ({ url, name: null, icon: null })),
        preserveStrategy:
          env.PH_CONNECT_DRIVES_PRESERVE_STRATEGY ?? "preserve-all",
      },
    } as PHConnectRuntimeConfig;
  }
  if (registry) {
    override.packageRegistryUrl = registry;
    override.cspRegistrySync = true;
  }
  return override;
}

function mergedConfigBody(
  outDir: string,
  override: ConnectServeOverride,
): string {
  const file = path.join(outDir, "powerhouse.config.json");
  const baked = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
    : {};
  const connect = override.connect
    ? deepMerge(
        (baked.connect ?? {}) as PHConnectRuntimeConfig,
        override.connect,
      )
    : baked.connect;
  return JSON.stringify({
    ...baked,
    connect,
    ...(override.packageRegistryUrl
      ? { packageRegistryUrl: override.packageRegistryUrl }
      : {}),
  });
}

/**
 * Append the registry origin to the baked CSP's script-src. The attribute
 * value is HTML-escaped (every CSP keyword is `&#39;`-quoted, which contains a
 * semicolon), so decode before touching directives and re-escape after —
 * ported from the ph-win-desktop sidecar, which this path replaces.
 */
export function patchCspScriptSrc(html: string, registryUrl: string): string {
  return html.replace(
    /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i,
    (_match, open: string, escaped: string, close: string) => {
      const policy = escaped.replace(/&amp;/g, "&").replace(/&#39;/g, "'");
      if (policy.includes(registryUrl)) return open + escaped + close;
      const patched = policy.replace(
        /script-src\s+([^;]*)/i,
        (_directive, sources: string) =>
          `script-src ${sources.trim()} ${registryUrl}`,
      );
      const reEscaped = patched.replace(/&/g, "&amp;").replace(/'/g, "&#39;");
      return open + reEscaped + close;
    },
  );
}

// The serve base: an explicit `--base`, else the basePath the dist was built with.
export function resolvePreviewBase(
  argBase: string | undefined,
  outDirAbs: string,
): string | undefined {
  if (argBase && argBase !== "/") return normalizeBasePath(argBase);
  try {
    const built = JSON.parse(
      readFileSync(path.join(outDirAbs, "powerhouse.config.json"), "utf8"),
    ) as { connect?: { app?: { basePath?: unknown } } };
    const basePath = built.connect?.app?.basePath;
    if (typeof basePath === "string" && basePath) {
      return normalizeBasePath(basePath);
    }
  } catch {
    // no readable dist config
  }
  return undefined;
}

// `pathname` relative to the deploy base ("/" + rest), or itself when outside it.
export function stripBase(pathname: string, base: string): string {
  return base !== "/" && pathname.startsWith(base)
    ? `/${pathname.slice(base.length)}`
    : pathname;
}

const IMMUTABLE = "public, max-age=31536000, immutable";

const HASHED_DIRS = ["/assets/", "/fonts/", "/__reactor_worker__/assets/"];

// Content-addressed output (hashed names, or a `v` query on the worker's), as in the nginx image.
export function previewCacheControl(
  pathname: string,
  search: string,
): string | undefined {
  if (HASHED_DIRS.some((dir) => pathname.startsWith(dir))) return IMMUTABLE;
  if (pathname.startsWith("/__vendor__/")) {
    return /\/(shared-deps|import-map)\.js(on)?$/.test(pathname)
      ? "no-cache"
      : IMMUTABLE;
  }
  if (pathname.startsWith("/__react__/")) return IMMUTABLE;
  if (pathname.startsWith("/__reactor_worker__/")) {
    return new URLSearchParams(search).has("v") ? IMMUTABLE : "no-cache";
  }
  return undefined;
}

function previewCacheHeadersPlugin(outDir: string, base: string): Plugin {
  return {
    name: "ph:preview-cache-headers",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const [rawPath, search = ""] = (req.url ?? "/").split("?");
        const rel = stripBase(rawPath, base);
        let value = previewCacheControl(rel, search);
        // A cached 404 would outlive the next deploy.
        if (value === IMMUTABLE && !existsSync(path.join(outDir, rel))) {
          value = undefined;
        }
        if (value) res.setHeader("Cache-Control", value);
        next();
      });
    },
  };
}

function serveOverridePlugin(
  outDir: string,
  override: ConnectServeOverride,
  base = "/",
): Plugin {
  return {
    name: "ph:serve-override",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = stripBase((req.url ?? "/").split("?")[0], base);
        if (urlPath === "/powerhouse.config.json") {
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(mergedConfigBody(outDir, override));
          return;
        }
        // index.html and extensionless SPA routes get the CSP patch.
        const isHtml =
          urlPath === "/" ||
          urlPath.endsWith("/index.html") ||
          !path.extname(urlPath);
        if (override.cspRegistrySync && isHtml) {
          const file = path.join(outDir, "index.html");
          if (existsSync(file)) {
            const merged = JSON.parse(mergedConfigBody(outDir, override)) as {
              packageRegistryUrl?: string;
            };
            const registry = merged.packageRegistryUrl;
            const html = readFileSync(file, "utf8");
            res.writeHead(200, {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
            });
            res.end(registry ? patchCspScriptSrc(html, registry) : html);
            return;
          }
        }
        next();
      });
    },
  };
}

const PRECOMPRESSED_TYPES: Record<string, string> = {
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
};

// Serves the build's `.gz` siblings of wasm/data; Vite's sirv ignores them.
export function precompressedAssetsPlugin(outDir: string, base = "/"): Plugin {
  return {
    name: "ph:precompressed-assets",
    configurePreviewServer(server) {
      const headers = server.config.preview.headers;
      const serve = sirv(outDir, {
        dev: true,
        etag: true,
        gzip: true,
        extensions: [],
        setHeaders(res, pathname) {
          if (headers) for (const k in headers) res.setHeader(k, headers[k]!);
          res.setHeader(
            "Content-Type",
            PRECOMPRESSED_TYPES[path.extname(pathname)],
          );
        },
      });
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "/";
        const [rawPath, search] = url.split("?");
        const rel = stripBase(rawPath, base);
        // Ranges are byte offsets into the identity body: leave them to Vite.
        if (
          !(PRECOMPRESS_EXTENSIONS as readonly string[]).includes(
            path.extname(rel),
          ) ||
          req.headers.range ||
          (base !== "/" && rel === rawPath)
        ) {
          return next();
        }
        req.url = search === undefined ? rel : `${rel}?${search}`;
        serve(req, res, () => {
          req.url = url;
          next();
        });
      });
    },
  };
}

export async function runConnectPreview(
  args: ConnectPreviewArgs,
  serveOverride?: ConnectServeOverride,
  dirname = process.cwd(),
) {
  // A supervisor can drive the preview via env when no explicit override is
  // passed (the classic `ph connect preview` command path).
  serveOverride ??= overrideFromEnv();
  const {
    outDir,
    port,
    host,
    open,
    cors,
    strictPort,
    printUrls,
    bindCLIShortcuts,
  } = args;

  const mode = "production";

  const baseConfig = getConnectBaseViteConfig({
    mode,
    dirname,
  });

  const outDirAbs = path.resolve(dirname, outDir);
  const base =
    resolvePreviewBase(args.connectBasePath, outDirAbs) ??
    baseConfig.base ??
    "/";

  const previewConfig: InlineConfig = {
    base,
    build: {
      outDir,
    },
    preview: {
      cors,
      port,
      strictPort,
      host,
      open,
    },
    plugins: [
      previewCacheHeadersPlugin(outDirAbs, base),
      precompressedAssetsPlugin(outDirAbs, base),
      ...(serveOverride
        ? [serveOverridePlugin(outDirAbs, serveOverride, base)]
        : []),
    ],
  };

  const config = mergeConfig(baseConfig, previewConfig);

  const server = await preview(config);

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
  return server;
}
