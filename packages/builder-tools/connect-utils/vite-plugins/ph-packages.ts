import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export type PhPackagesPluginOptions = {
  packages: string[];
  projectRoot?: string;
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

export function phPackagesPlugin(options: PhPackagesPluginOptions): Plugin {
  const projectRoot = options.projectRoot ?? process.cwd();
  const localPackage = readProjectPackageInfo(projectRoot);
  const content = JSON.stringify(
    {
      packages: options.packages,
      localPackage,
    },
    null,
    2,
  );

  return {
    name: "vite-plugin-ph-packages",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith("/ph-packages.json")) {
          res.setHeader("Content-Type", "application/json");
          res.end(content);
          return;
        }
        next();
      });
    },
    hotUpdate: {
      order: "pre",
      handler(ctx) {
        // filter out modules only imported by "style.css"
        // to avoid page reloads triggered by tailwind
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
        fileName: "ph-packages.json",
        source: content,
      });
    },
  };
}
