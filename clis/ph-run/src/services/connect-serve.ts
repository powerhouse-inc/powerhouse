import { getConfig } from "@powerhousedao/config/node";
import {
  DEFAULT_CONNECT_OUTDIR,
  type PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import { deepMerge, normalizeBasePath } from "@powerhousedao/shared/connect";
import {
  APP_SHELLS_FILE,
  appShellVariant,
  appShellVariantOf,
  readShellPluginsIn,
  swapAppShell,
  withShellAppName,
  type AppShells,
} from "@powerhousedao/shared/connect/app-shell";
import {
  isHtmlNavigation,
  isSwitchboardProxyPath,
} from "@powerhousedao/shared/connect/origin-placeholder";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import sirv from "sirv";
import type { ConnectPreviewArgs } from "./classic-args.js";

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

/** The steps both Connect servers run, in the order they run them. */
export type ConnectMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

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

export function cacheHeaders(outDir: string, base: string): ConnectMiddleware {
  return (req, res, next) => {
    const [rawPath, search = ""] = (req.url ?? "/").split("?");
    const rel = stripBase(rawPath, base);
    let value = previewCacheControl(rel, search);
    // A cached 404 would outlive the next deploy.
    if (value === IMMUTABLE && !existsSync(path.join(outDir, rel))) {
      value = undefined;
    }
    if (value) res.setHeader("Cache-Control", value);
    next();
  };
}

type HtmlTransform = (html: string) => string;

/** The dist's shell for the served config: its composition's variant and its app name. */
export function shellSwapFor(
  outDir: string,
  override: ConnectServeOverride,
  base = "/",
): HtmlTransform | undefined {
  const composition = override.connect?.composition;
  const renamed = override.connect?.branding?.appName !== undefined;
  if (!composition && !renamed) return undefined;
  const file = path.join(outDir, APP_SHELLS_FILE);
  // The manifest the build copied from the Connect it used.
  const variant =
    composition && appShellVariant(composition, readShellPluginsIn(outDir));
  const shell =
    variant && existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as AppShells)[variant]
      : undefined;
  // The name the app will title itself with: the served (baked + override) config's.
  const appName = (
    JSON.parse(mergedConfigBody(outDir, override)) as {
      connect?: { branding?: { appName?: string } };
    }
  ).connect?.branding?.appName;
  return (html) =>
    shell && appShellVariantOf(html) !== variant
      ? swapAppShell(html, shell, base, appName)
      : withShellAppName(html, appName);
}

/**
 * Whether a request on a proxying server belongs to the switchboard: its
 * paths go to the proxy, untouched, except a browser navigation under `/d/`
 * (Connect's own drive routes), as switchboardProxy splits them.
 */
export function isProxiedRequest(urlPath: string, accept: string | undefined) {
  if (!isSwitchboardProxyPath(urlPath)) return false;
  return !(urlPath.startsWith("/d/") && isHtmlNavigation(accept));
}

export function serveOverrideStep(
  outDir: string,
  override: ConnectServeOverride,
  base = "/",
  swapShell?: HtmlTransform,
  proxied = false,
): ConnectMiddleware {
  return (req, res, next) => {
    const urlPath = stripBase((req.url ?? "/").split("?")[0], base);
    if (urlPath === "/powerhouse.config.json") {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(mergedConfigBody(outDir, override));
      return;
    }
    // The switchboard's paths are the proxy's, which runs after this:
    // served the SPA shell instead, /graphql would never reach it.
    if (proxied && isProxiedRequest(urlPath, req.headers.accept)) {
      next();
      return;
    }
    // index.html and extensionless SPA routes get the CSP patch.
    const isHtml =
      urlPath === "/" ||
      urlPath.endsWith("/index.html") ||
      !path.extname(urlPath);
    if ((override.cspRegistrySync || swapShell) && isHtml) {
      const file = path.join(outDir, "index.html");
      if (existsSync(file)) {
        let html = readFileSync(file, "utf8");
        if (override.cspRegistrySync) {
          const merged = JSON.parse(mergedConfigBody(outDir, override)) as {
            packageRegistryUrl?: string;
          };
          const registry = merged.packageRegistryUrl;
          if (registry) html = patchCspScriptSrc(html, registry);
        }
        if (swapShell) html = swapShell(html);
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(html);
        return;
      }
    }
    next();
  };
}

/** Extensions whose files have `.gz` siblings. */
export const PRECOMPRESS_EXTENSIONS = [".wasm", ".data"] as const;

const PRECOMPRESSED_TYPES: Record<string, string> = {
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
};

// Serves the build's `.gz` siblings of wasm/data, which the main sirv ignores.
export function precompressedAssets(
  outDir: string,
  base = "/",
): ConnectMiddleware {
  const serve = sirv(outDir, {
    dev: true,
    etag: true,
    gzip: true,
    extensions: [],
    setHeaders(res, pathname) {
      res.setHeader(
        "Content-Type",
        PRECOMPRESSED_TYPES[path.extname(pathname)],
      );
    },
  });
  return (req, res, next) => {
    const url = req.url ?? "/";
    const [rawPath, search] = url.split("?");
    const rel = stripBase(rawPath, base);
    // Ranges are byte offsets into the identity body: leave them to the server.
    if (
      !(PRECOMPRESS_EXTENSIONS as readonly string[]).includes(
        path.extname(rel),
      ) ||
      req.headers.range ||
      (base !== "/" && rel === rawPath)
    ) {
      next();
      return;
    }
    req.url = search === undefined ? rel : `${rel}?${search}`;
    serve(req, res, () => {
      req.url = url;
      next();
    });
  };
}

/** Throws, naming the missing file and the build, when `outDirAbs` holds no build. */
export function assertConnectBuild(
  outDirArg: string,
  outDirAbs: string,
  dirname: string,
): void {
  if (existsSync(path.join(outDirAbs, "index.html"))) return;
  const shown = path
    .relative(dirname, path.join(outDirAbs, "index.html"))
    .split(path.sep)
    .join("/");
  const build =
    path.resolve(dirname, DEFAULT_CONNECT_OUTDIR) === outDirAbs
      ? "ph connect build"
      : `ph connect build --outDir ${JSON.stringify(outDirArg)}`;
  throw new Error(
    `No Connect build to serve: ${shown} is missing. Build it first with \`${build}\`.`,
  );
}

/** The served base: `--base`, else what the dist or the project was built with. */
export function connectBaseOf(
  args: Pick<ConnectPreviewArgs, "connectBasePath">,
  outDirAbs: string,
  dirname: string,
): string {
  // Serving a dist needs only its base, not the build's plugin stack.
  const sourceBasePath = getConfig(path.join(dirname, "powerhouse.config.json"))
    .connect?.app?.basePath;
  return (
    resolvePreviewBase(args.connectBasePath, outDirAbs) ??
    (sourceBasePath ? normalizeBasePath(sourceBasePath) : "/")
  );
}
