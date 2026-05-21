import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import type { PowerhousePackage } from "@powerhousedao/config";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import {
  applyEnvSeeding,
  buildRuntimeConfig,
  DEFAULT_CONNECT_CONFIG,
  deepMerge,
} from "@powerhousedao/shared/connect";
import { RUNTIME_CONFIG_SCHEMA_URL } from "../runtime-config-schema.js";

export type PhConfigPluginOptions = {
  packages: PowerhousePackage[];
  projectRoot?: string;
  connect?: PHConnectRuntimeConfig;
  /**
   * Project-wide package registry URL — the effective value (CLI override
   * `??` env `??` source) the caller has already resolved. Copied verbatim
   * into the emitted runtime config (no namespace change); the SPA reads
   * `runtimeConfig.packageRegistryUrl` directly.
   */
  packageRegistryUrl?: string;
  /**
   * CLI-supplied connect override (final merge layer, beats source + env).
   * Forwarded from `ph connect build`'s `--json` + individual `--flag` parsing.
   * See clis/ph-cli/src/utils/cli-connect-override.ts.
   */
  cliConnectOverride?: PHConnectRuntimeConfig;
  /**
   * Explicitly-set runtime env vars (not schema defaults). Used to seed
   * powerhouse.config.json fields when an env var is set and the field is
   * absent from the source config. Defaults to `process.env`, but callers
   * should pass a filtered map when `process.env` has been polluted with
   * schema defaults (see vite-config.ts).
   */
  explicitRuntimeEnv?: Readonly<Record<string, string | undefined>>;
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

export function phConfigPlugin(options: PhConfigPluginOptions): Plugin {
  const projectRoot = options.projectRoot ?? process.cwd();
  const localPackage = readProjectPackageInfo(projectRoot);

  const { connect: seededConnect, seeded } = applyEnvSeeding(
    options.connect ?? {},
    options.explicitRuntimeEnv ?? process.env,
  );

  for (const report of seeded) {
    console.warn(
      `[ph-config] Seeded powerhouse.config.json connect.${report.path} from ${report.envVar}. ` +
        `This env var is deprecated — set the field directly in powerhouse.config.json.`,
    );
  }

  // Precedence ladder (lowest → highest) for the emitted connect.* block:
  //   DEFAULT_CONNECT_CONFIG  (base — fills in any field nothing else supplied)
  //     < env-var seeds       (legacy compat, applied above via applyEnvSeeding)
  //     < source.connect      (user's hand-edited powerhouse.config.json, already on top of seeds)
  //     < cliConnectOverride  (task 9: `ph connect build --json` + individual flags)
  const withDefaults = deepMerge(DEFAULT_CONNECT_CONFIG, seededConnect);
  const mergedConnect = options.cliConnectOverride
    ? deepMerge(withDefaults, options.cliConnectOverride)
    : withDefaults;
  const source = {
    packages: options.packages,
    packageRegistryUrl: options.packageRegistryUrl,
    connect: mergedConnect,
  };

  const runtimeConfig = buildRuntimeConfig(source, localPackage);
  const content = JSON.stringify(
    { $schema: RUNTIME_CONFIG_SCHEMA_URL, ...runtimeConfig },
    null,
    2,
  );

  return {
    name: "vite-plugin-ph-config",
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
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "powerhouse.config.json",
        source: content,
      });
    },
  };
}
