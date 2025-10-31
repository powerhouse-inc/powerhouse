import type { ModuleNode, PluginOption } from "vite";

/**
 * Takes a list of Powerhouse project packages, by name or path and
 * returns a js module that exports those packages for use in Connect.
 */
function makeImportScriptFromPackages(packages: string[]) {
  const imports: string[] = [];
  const moduleNames: string[] = [];
  const counter = 0;

  const content = `
   export async function loadExternalPackages() {
      const modules = [];
      ${packages
        .map(
          (pkg, index) =>
            `try {
          const module = await import('${pkg}');
          await import('${pkg}/style.css');
          modules.push({
              id: 'module${index}',
              ...module,
          });
      } catch (error) {
          console.error("Error loading package", pkg, error);
      }`,
        )
        .join("\n")}
      return modules;
    }
  `;

  // Add HMR boundary to prevent page reload
  const hmrCode = `
// HMR boundary - accept updates to prevent full page reload
if (import.meta.hot) {
  import.meta.hot.accept();
}`;

  const fileContent = `${content}\n\n\n`; //`${imports.join("\n")}\n\n${exportStatement}\n`;

  return fileContent;
}

export function phExternalPackagesPlugin(phPackages: string[]) {
  const virtualModuleId = "virtual:ph:external-packages";

  const plugin: PluginOption = {
    name: "ph-external-packages",
    enforce: "pre",
    resolveId(id) {
      if (id === virtualModuleId) {
        return id;
      }
    },
    load(id) {
      if (id === virtualModuleId) {
        return makeImportScriptFromPackages(phPackages);
      }
    },
    handleHotUpdate({ file, server, modules, timestamp }) {
      // console.log(
      //   file,
      //   modules.flatMap((m) => Array.from(m.importers).map((i) => i.id)),
      // );
      // Check if the changed file is part of any local package
      const isLocalPackageFile = phPackages.some((pkg) => {
        if (pkg.startsWith("/") || pkg.startsWith(".")) {
          return file.startsWith(pkg);
        }
        return false;
      });

      if (!isLocalPackageFile) {
        return undefined;
      }

      // if (file.endsWith("powerhouse.manifest.json")) {
      //   const virtualModule = server.moduleGraph.getModuleById(virtualModuleId);

      //   if (virtualModule) {
      //     console.log("Invalidating virtual module", virtualModule);
      //     // deduplicatedModules.push(virtualModule);
      //     return [virtualModule];
      //   }
      // }

      // Deduplicate modules by file path, preferring modules with defined IDs
      const modulesByFile = new Map<string, (typeof modules)[0]>();
      for (const module of modules) {
        if (module.file) {
          const existing = modulesByFile.get(module.file);
          // Prefer modules with defined IDs over ones without IDs
          if (!existing || (module.id && !existing.id)) {
            modulesByFile.set(module.file, module);
          }
        }
      }
      const deduplicatedModules = Array.from(modulesByFile.values()).filter(
        (m) => m.id && m.id !== virtualModuleId,
      );

      if (file.endsWith(".tsx") || file.endsWith(".jsx")) {
        return deduplicatedModules;
      }

      const invalidatedModules = new Set<ModuleNode>();
      for (const mod of deduplicatedModules) {
        server.moduleGraph.invalidateModule(
          mod,
          invalidatedModules,
          timestamp,
          true,
        );
        invalidatedModules.add(mod);
      }
      if (invalidatedModules.size) {
        // console.log("INVALIDATED MODULES");
        // server.ws.send("ph:studio:external-packages-updated");
      }
      if (file.endsWith("powerhouse.manifest.json")) {
        const virtualModule = server.moduleGraph.getModuleById(virtualModuleId);
        const manifestModule = server.moduleGraph.getModuleById(file);

        if (virtualModule && manifestModule) {
          console.log("DEU");
          server.moduleGraph.invalidateModule(manifestModule);

          // deduplicatedModules.push(virtualModule);
          return [virtualModule];
        }
      }

      return [];

      // If no modules are affected, the file isn't imported by the browser
      if (modules.length === 0) {
        console.log("[ph-external-packages] No modules affected, skipping HMR");
        return undefined;
      }

      // Let Vite handle normal HMR propagation for files in the import chain
      console.log("[ph-external-packages] Processing HMR for affected modules");
      return [...invalidatedModules];
      // Invalidate the virtual module so it re-executes with new imports
      // server.moduleGraph.invalidateModule(virtualModule);

      // // Notify clients about package updates via WebSocket
      // const clientUrl = `/@id/${resolvedVirtualModuleId}`;
      // server.ws.send("studio:external-packages-updated", {
      //   url: clientUrl,
      //   timestamp: Date.now().toString(),
      // });

      // // Deduplicate modules by file path, preferring modules with defined IDs
      // const modulesByFile = new Map<string, (typeof modules)[0]>();
      // for (const module of modules) {
      //   if (module.file) {
      //     const existing = modulesByFile.get(module.file);
      //     // Prefer modules with defined IDs over ones without IDs
      //     if (!existing || (module.id && !existing.id)) {
      //       modulesByFile.set(module.file, module);
      //     }
      //   }
      // }
      // const deduplicatedModules = Array.from(modulesByFile.values()).filter(
      //   (m) => m.id && m.id !== resolvedVirtualModuleId,
      // );

      // // For React components (.tsx, .jsx), let Fast Refresh handle them
      // const isReactComponent =
      //   file.endsWith(".tsx") || file.endsWith(".jsx");

      // if (isReactComponent) {
      //   return [...deduplicatedModules, virtualModule];
      // } else {
      //   return [virtualModule];
      // }
    },
  };

  return plugin;
}
