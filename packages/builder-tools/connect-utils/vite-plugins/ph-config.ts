import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import type { PowerhousePackage } from "@powerhousedao/config";
import type {
  PHConnectBranding,
  PHConnectRuntimeConfig,
  PowerhouseConfig,
} from "@powerhousedao/shared/clis";
import {
  buildRuntimeConfig,
  deepMerge,
  resolveSourceConnect,
  workflowsSettingConflict,
} from "@powerhousedao/shared/connect";
import { RUNTIME_CONFIG_SCHEMA_URL } from "../runtime-config-schema.js";

export type PhConfigPluginOptions = {
  packages: PowerhousePackage[];
  projectRoot?: string;
  connect?: PHConnectRuntimeConfig;
  /** The source's top-level `workflows` block; `connect.app.workflowsEnabled` falls back to it. */
  workflows?: PowerhouseConfig["workflows"];
  /**
   * Project-wide package registry URL — the effective value (CLI override
   * `??` source) the caller has already resolved. Copied verbatim into the
   * emitted runtime config (no namespace change); the SPA reads
   * `runtimeConfig.packageRegistryUrl` directly.
   */
  packageRegistryUrl?: string;
  /**
   * CLI-supplied connect override (final merge layer, beats source).
   * Forwarded from `ph connect build`'s `--json` + individual `--flag` parsing.
   * See clis/ph-cli/src/utils/cli-connect-override.ts.
   */
  cliConnectOverride?: PHConnectRuntimeConfig;
  /**
   * The resolved `connect.branding` (images as data URIs, null = default),
   * computed once by the Vite config from the same ladder. Replaces the
   * merged block, so the browser never sees a project path.
   */
  branding?: PHConnectBranding;
};

function readProjectPackageInfo(
  projectRoot: string | undefined,
): { name: string; version: string } | null {
  if (!projectRoot) return null;
  try {
    const raw = fs.readFileSync(
      path.join(projectRoot, "package.json"),
      "utf-8",
    );
    const pkg = JSON.parse(raw) as { name?: unknown; version?: unknown };
    if (typeof pkg.name !== "string" || typeof pkg.version !== "string") {
      return null;
    }
    return { name: pkg.name, version: pkg.version };
  } catch {
    return null;
  }
}

/** `html` with its `<title>` text set to `appName`, when one is configured. */
export function withAppTitle(html: string, appName: string | undefined) {
  if (!appName) return html;
  const escaped = appName
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return html.replace(
    /<title>[^<]*<\/title>/,
    () => `<title>${escaped}</title>`,
  );
}

type PhConfigApi = { connect: PHConnectRuntimeConfig; favicon?: string };

/** `api.connect`: the connect config the app is served, for plugins that render
 * ahead of it; `api.favicon`: its `branding.favicon`, which it leaves out. */
export function phConfigPlugin(
  options: PhConfigPluginOptions,
): Plugin<PhConfigApi> & { api: PhConfigApi } {
  const projectRoot = options.projectRoot ?? process.cwd();
  const localPackage = readProjectPackageInfo(projectRoot);

  // Precedence ladder (lowest → highest) for the emitted connect.* block:
  //   DEFAULT_CONNECT_CONFIG  (base — fills in any field nothing else supplied)
  //     < source.workflows    (project-wide `workflows.enabled`)
  //     < source.connect      (user's hand-edited powerhouse.config.json)
  //     < cliConnectOverride  (`ph connect build --json` + individual flags)
  //
  // Env vars are NOT a layer in this ladder. The Connect SPA's runtime
  // configuration is exclusively set via `powerhouse.config.json` or CLI
  // overrides (`ph connect build --<field>` / `ph connect config --<field>`).
  const sourceSettings = {
    connect: options.connect,
    workflows: options.workflows,
  };
  const conflict = workflowsSettingConflict(sourceSettings);
  if (conflict) console.warn(`[powerhouse] ${conflict}`);
  const withDefaults = resolveSourceConnect(sourceSettings);
  const mergedConnect = options.cliConnectOverride
    ? deepMerge(withDefaults, options.cliConnectOverride)
    : withDefaults;
  // The favicon is a build input: a project file the app never reads.
  const { favicon, ...branding } = mergedConnect.branding ?? {};
  const source = {
    packages: options.packages,
    packageRegistryUrl: options.packageRegistryUrl,
    // The resolved branding (images as data URIs) replaces the merged block;
    // without it, the merged block less the favicon.
    connect: options.branding
      ? { ...mergedConnect, branding: options.branding }
      : mergedConnect.branding
        ? { ...mergedConnect, branding }
        : mergedConnect,
  };

  const runtimeConfig = buildRuntimeConfig(source, localPackage);
  const content = JSON.stringify(
    { $schema: RUNTIME_CONFIG_SCHEMA_URL, ...runtimeConfig },
    null,
    2,
  );

  return {
    name: "vite-plugin-ph-config",
    api: { connect: runtimeConfig.connect, favicon: favicon ?? undefined },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith("/powerhouse.config.json")) {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache");
          res.end(content);
          return;
        }
        next();
      });
    },
    hotUpdate: {
      order: "pre",
      handler(ctx) {
        return ctx.modules.filter((mod) => {
          if (mod.importers.size > 1) {
            return true;
          }
          const importer = mod.importers.values().next();
          return !importer.value?.file?.endsWith(".css");
        });
      },
    },
    // The tab shows the app's name before the app sets each page's title.
    transformIndexHtml(html) {
      return withAppTitle(
        html,
        runtimeConfig.connect.branding?.appName ?? undefined,
      );
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "powerhouse.config.json",
        source: content,
      });
    },
  };
}
