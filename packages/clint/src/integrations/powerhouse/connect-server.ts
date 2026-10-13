// sirv-backed static server for pre-built Connect SPA assets: precompressed
// brotli/gzip + immutable assets, plus a dynamic-base HTML transform (see substituteDynamicBase).

import { createServer, type Server } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { existsSync, statSync } from "node:fs";
import { parseArgs, promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { brotliCompress, gzip, constants as zlib } from "node:zlib";
import sirv from "sirv";

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

export interface ConnectServerOptions {
  // Directory containing the built SPA (must hold an index.html).
  dir: string;
  // Deploy base path the SPA is mounted under (proxy mount, not a per-route
  // prefix). Normalized to leading+trailing-slash form ('/' | '/x/'). Default '/'.
  base?: string;
  // Generate missing .br/.gz siblings at startup (skips up-to-date ones).
  precompress?: boolean;
}

const ASSET_MAX_AGE = 31536000;
const TOPLEVEL_MAX_AGE = 3600;
// /__react__ entrypoints have stable URLs but mutate on a React bump, so cache
// long yet revalidatable (not immutable) — a bump recovers within the window.
const REACT_ENTRY_MAX_AGE = 604800;
const COMPRESSIBLE = new Set([
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".wasm",
  ".map",
  ".txt",
  ".xml",
  ".ico",
  ".webmanifest",
  ".data",
]);
const COMPRESS_MIN_BYTES = 1024;

// Normalize a deploy base to leading+trailing-slash form ('/' | '/x/').
function normalizeBase(base: string | undefined): string {
  const trimmed = base?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  return trimmed === "" ? "/" : `/${trimmed}/`;
}

const DYNAMIC_BASE_TOKEN = "/__PH_DYNAMIC_BASE__/";

// Replace the dynamic-base token with the deploy base and set
// `globalThis.__PH_DYNAMIC_BASE__` before the entry bundle runs; no token = unchanged.
function substituteDynamicBase(html: string, base: string): string {
  if (!html.includes(DYNAMIC_BASE_TOKEN)) return html;
  const replaced = html.split(DYNAMIC_BASE_TOKEN).join(base);
  if (/globalThis\.__PH_DYNAMIC_BASE__\s*=/.test(replaced)) return replaced;
  const inject = `<script>globalThis.__PH_DYNAMIC_BASE__=${JSON.stringify(base)};</script>`;
  const headOpen = replaced.match(/<head[^>]*>/i);
  if (headOpen?.index !== undefined) {
    const at = headOpen.index + headOpen[0].length;
    return replaced.slice(0, at) + inject + replaced.slice(at);
  }
  return inject + replaced;
}

// Pre-paint theme boot: `?theme=dark|light` persists to `ph:theme`, then the
// stored choice (or system preference) decides the `.dark` root class before
// hydration. Fail-silent — storage access can throw in embed/privacy contexts.
const THEME_BOOT_SCRIPT =
  `<script data-ph-theme-boot>(function(){try{` +
  `var p=new URLSearchParams(location.search).get('theme');` +
  `if(p==='dark'||p==='light')localStorage.setItem('ph:theme',p);` +
  `var s=localStorage.getItem('ph:theme');` +
  `var d=s==='dark'||((!s||s==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);` +
  `document.documentElement.classList.toggle('dark',d);` +
  `}catch(e){}})();</script>`;

// Inject the theme boot script at the top of <head>; the marker attribute
// keeps documents that already carry it (or a build-time copy) untouched.
function injectThemeBootScript(html: string): string {
  if (html.includes("data-ph-theme-boot")) return html;
  const headOpen = html.match(/<head[^>]*>/i);
  if (headOpen?.index !== undefined) {
    const at = headOpen.index + headOpen[0].length;
    return html.slice(0, at) + THEME_BOOT_SCRIPT + html.slice(at);
  }
  return THEME_BOOT_SCRIPT + html;
}

// A precompressed sibling is reusable when it exists and is at least as new as
// its source — content-hashed asset names make this stable across restarts.
function siblingFresh(path: string, srcMtimeMs: number): boolean {
  try {
    return statSync(path).mtimeMs >= srcMtimeMs;
  } catch {
    return false;
  }
}

export interface PrecompressOptions {
  // Brotli quality 0-11; higher is smaller and slower. Default 5 (fast, for the
  // runtime boot path). A build-time pass can afford 11.
  brotliQuality?: number;
  // Gzip level 0-9. Default 6.
  gzipLevel?: number;
}

// Write missing/stale .br and .gz siblings for compressible assets under `dir`.
export async function precompressAssets(
  dir: string,
  options: PrecompressOptions = {},
): Promise<{ count: number; ms: number }> {
  // Loaded here, not at module top: totalist is only needed on the precompress
  // path, so the server's hot path doesn't pull it in.
  const { totalist } = await import("totalist");
  const brotliQuality = options.brotliQuality ?? 5;
  const gzipLevel = options.gzipLevel ?? 6;
  const start = Date.now();
  let count = 0;
  await totalist(
    dir,
    async (
      _rel: string,
      abs: string,
      stats: { size: number; mtimeMs: number },
    ) => {
      const ext = extname(abs);
      if (abs.endsWith(".br") || abs.endsWith(".gz")) return;
      if (!COMPRESSIBLE.has(ext) || stats.size < COMPRESS_MIN_BYTES) return;
      let buf: Buffer | undefined;
      const br = `${abs}.br`;
      if (!siblingFresh(br, stats.mtimeMs)) {
        buf ??= await readFile(abs);
        await writeFile(
          br,
          await brotliAsync(buf, {
            params: {
              [zlib.BROTLI_PARAM_QUALITY]: brotliQuality,
              [zlib.BROTLI_PARAM_SIZE_HINT]: stats.size,
            },
          }),
        );
        count++;
      }
      const gz = `${abs}.gz`;
      if (!siblingFresh(gz, stats.mtimeMs)) {
        buf ??= await readFile(abs);
        await writeFile(gz, await gzipAsync(buf, { level: gzipLevel }));
        count++;
      }
    },
  );
  return { count, ms: Date.now() - start };
}

// Create the Connect static server (not yet listening). Throws when `dir`
// holds no index.html.
export function createConnectServer(options: ConnectServerOptions): Server {
  const { dir } = options;
  const base = normalizeBase(options.base);
  const indexPath = join(dir, "index.html");

  if (!existsSync(indexPath)) {
    throw new Error(`index.html not found in ${dir}`);
  }

  // sirv streams concrete files, serving a precompressed .br/.gz sibling when
  // accepted. HTML is handled separately, so its fallback/extension probing stay off.
  const buildAssetServer = () =>
    sirv(dir, {
      etag: true,
      brotli: true,
      gzip: true,
      single: false,
      extensions: [],
      // Set Cache-Control here, not via sirv's maxAge/immutable: a global one is
      // baked into writeHead and would override this per-path setHeader.
      setHeaders(res, pathname) {
        // Content-hashed dirs (/assets, /__react__/chunks) are immutable; the
        // stable-URL /__react__ entrypoints get a long revalidatable TTL.
        if (
          pathname.startsWith("/assets/") ||
          pathname.startsWith("/__react__/chunks/")
        ) {
          res.setHeader(
            "Cache-Control",
            `public, max-age=${ASSET_MAX_AGE}, immutable`,
          );
        } else if (pathname.startsWith("/__react__/")) {
          res.setHeader(
            "Cache-Control",
            `public, max-age=${REACT_ENTRY_MAX_AGE}`,
          );
        } else {
          res.setHeader("Cache-Control", `public, max-age=${TOPLEVEL_MAX_AGE}`);
        }
      },
    });

  // Swapped after background precompression so sirv's boot-time file map (built
  // at construction, in non-dev) picks up the new .br/.gz siblings.
  let serveAsset = buildAssetServer();
  if (options.precompress) {
    precompressAssets(dir)
      .then(({ count, ms }) => {
        // Rebuild only when new siblings were written; a warm restart already
        // saw the existing ones (sirv reads the dir at construction).
        if (count > 0) serveAsset = buildAssetServer();
        console.log(`  Precompressed ${count} asset variants in ${ms}ms`);
      })
      .catch((err) =>
        console.error(`  Precompress failed: ${(err as Error).message}`),
      );
  }

  // The substituted HTML shell is cached per file path; base is fixed per process.
  const htmlCache = new Map<string, string>();
  async function loadHtmlDocument(path: string): Promise<string> {
    let doc = htmlCache.get(path);
    if (doc === undefined) {
      doc = injectThemeBootScript(
        substituteDynamicBase(await readFile(path, "utf-8"), base),
      );
      htmlCache.set(path, doc);
    }
    return doc;
  }

  const sendShell = (
    res: import("node:http").ServerResponse,
    target: string,
  ): void => {
    loadHtmlDocument(target)
      .then((body) => {
        res.writeHead(200, {
          "Content-Type": "text/html",
          "Cache-Control": "no-cache",
        });
        res.end(body);
      })
      .catch((err) => {
        console.error(
          `connect-server: failed to render shell: ${(err as Error).message}`,
        );
        res.writeHead(500);
        res.end("Internal Server Error");
      });
  };

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const ext = extname(url.pathname);

    // Extensionless routes (SPA paths) and .html → the dynamic-base shell, no-cache.
    if (ext === "" || ext === ".html") {
      const specific = ext === ".html" ? join(dir, url.pathname) : "";
      sendShell(res, specific && existsSync(specific) ? specific : indexPath);
      return;
    }

    serveAsset(req, res, () => {
      // Missing /assets/ file is a hard 404 (masking it with HTML hides broken
      // refs); any other miss is a client-side route → serve the SPA shell.
      if (url.pathname.startsWith("/assets/")) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      sendShell(res, indexPath);
    });
  });
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  const { values } = parseArgs({
    options: {
      dir: { type: "string" },
      port: { type: "string" },
      base: { type: "string" },
      precompress: { type: "boolean" },
    },
  });

  const dir = values.dir;
  const port = parseInt(values.port ?? "3000", 10);

  if (!dir) {
    console.error(
      "Usage: node connect-server.js --dir <path> --port <port> [--base </deploy/base/>] [--precompress]",
    );
    process.exit(1);
  }

  let server: Server;
  try {
    server = createConnectServer({
      dir,
      base: values.base,
      precompress: values.precompress,
    });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  // Listen (and announce readiness) immediately; precompression runs in the
  // background and swaps in compressed serving when done.
  server.listen(port, () => {
    console.log(`  Local: http://localhost:${port}/`);
  });
}
