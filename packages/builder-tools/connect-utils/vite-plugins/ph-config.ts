import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import type { PowerhousePackage } from "@powerhousedao/config";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { buildRuntimeConfig } from "@powerhousedao/shared/connect";
import {
  RUNTIME_CONFIG_SCHEMA_FILENAME,
  RUNTIME_CONFIG_SCHEMA_REF,
  runtimeConfigSchema,
} from "../runtime-config-schema.js";

export type PhConfigPluginOptions = {
  packages: PowerhousePackage[];
  projectRoot?: string;
  connect?: PHConnectRuntimeConfig;
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

  const source = {
    packages: options.packages,
    connect: options.connect ?? {},
  };

  const runtimeConfig = buildRuntimeConfig(source, localPackage);
  const content = JSON.stringify(
    { $schema: RUNTIME_CONFIG_SCHEMA_REF, ...runtimeConfig },
    null,
    2,
  );
  const schemaContent = JSON.stringify(runtimeConfigSchema, null, 2);

  return {
    name: "vite-plugin-ph-config",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith("/powerhouse.config.json")) {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(content);
          return;
        }
        if (req.url?.endsWith(`/${RUNTIME_CONFIG_SCHEMA_FILENAME}`)) {
          res.setHeader("Content-Type", "application/schema+json");
          res.setHeader("Cache-Control", "no-store");
          res.end(schemaContent);
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
      this.emitFile({
        type: "asset",
        fileName: RUNTIME_CONFIG_SCHEMA_FILENAME,
        source: schemaContent,
      });
    },
  };
}
