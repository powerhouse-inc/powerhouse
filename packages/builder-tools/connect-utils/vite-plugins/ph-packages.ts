import type { Plugin } from "vite";

export type PhPackagesPluginOptions = {
  packages: string[];
};

export function phPackagesPlugin(options: PhPackagesPluginOptions): Plugin {
  const content = JSON.stringify(
    {
      packages: options.packages,
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
