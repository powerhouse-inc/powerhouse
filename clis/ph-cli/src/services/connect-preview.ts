import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { deepMerge } from "@powerhousedao/shared/connect";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { InlineConfig, Plugin } from "vite";
import { mergeConfig, preview } from "vite";
import type { ConnectPreviewArgs } from "../types.js";

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
  return JSON.stringify({ ...baked, connect });
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

function serveOverridePlugin(
  outDir: string,
  override: ConnectServeOverride,
): Plugin {
  return {
    name: "ph:serve-override",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url ?? "/").split("?")[0];
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

export async function runConnectPreview(
  args: ConnectPreviewArgs,
  serveOverride?: ConnectServeOverride,
) {
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

  const dirname = process.cwd();

  const baseConfig = getConnectBaseViteConfig({
    mode,
    dirname,
  });

  const previewConfig: InlineConfig = {
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
    ...(serveOverride
      ? {
          plugins: [
            serveOverridePlugin(path.resolve(dirname, outDir), serveOverride),
          ],
        }
      : {}),
  };

  const config = mergeConfig(baseConfig, previewConfig);

  const server = await preview(config);

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
}
