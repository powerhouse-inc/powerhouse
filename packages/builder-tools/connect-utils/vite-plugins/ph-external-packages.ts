import type { PluginOption } from "vite";

/**
 * Takes a list of Powerhouse project packages, by name or path and
 * returns a js module that exports those packages for use in Connect.
 */
function makeImportScriptFromPackages(packages: string[]) {
  const imports: string[] = [];
  const moduleNames: string[] = [];
  let counter = 0;

  for (const packageName of packages) {
    const moduleName = `module${counter}`;
    moduleNames.push(moduleName);
    imports.push(`import * as ${moduleName} from '${packageName}';`);
    imports.push(`import '${packageName}/style.css';`);
    counter++;
  }

  const exports = moduleNames.map(
    (name, index) => `{
      id: "${packages[index]}",
      ...${name},
    }`,
  );

  const exportsString = exports.length
    ? `
        ${exports.join(",\n")}
    `
    : "";

  const exportStatement = `export default [${exportsString}];`;

  // Add HMR boundary to prevent page reload
  const hmrCode = `
// HMR boundary - accept updates to prevent full page reload
if (import.meta.hot) {
  import.meta.hot.accept();
}`;

  const fileContent = `${imports.join("\n")}\n\n${exportStatement}\n${hmrCode}`;

  return fileContent;
}

export function phExternalPackagesPlugin(phPackages: string[]) {
  const virtualModuleId = "virtual:ph:external-packages";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  const plugin: PluginOption = {
    name: "ph-external-packages",
    enforce: "pre",
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        return makeImportScriptFromPackages(phPackages);
      }
    },
    handleHotUpdate({ file, server, modules }) {
      // Check if the changed file is part of any local package
      const isLocalPackageFile = phPackages.some((pkg) => {
        if (pkg.startsWith("/") || pkg.startsWith(".")) {
          return file.startsWith(pkg);
        }
        return false;
      });

      if (isLocalPackageFile) {
        const virtualModule = server.moduleGraph.getModuleById(
          resolvedVirtualModuleId,
        );

        if (virtualModule) {
          // Invalidate the virtual module so it re-executes with new imports
          server.moduleGraph.invalidateModule(virtualModule);

          // Notify clients about package updates via WebSocket
          const clientUrl = `/@id/${resolvedVirtualModuleId}`;
          server.ws.send("studio:external-packages-updated", {
            url: clientUrl,
            timestamp: Date.now().toString(),
          });

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
            (m) => m.id && m.id !== resolvedVirtualModuleId,
          );

          // For React components (.tsx, .jsx), let Fast Refresh handle them
          const isReactComponent =
            file.endsWith(".tsx") || file.endsWith(".jsx");

          if (isReactComponent) {
            return [...deduplicatedModules, virtualModule];
          } else {
            return [virtualModule];
          }
        }
      }

      return undefined;
    },
  };

  return plugin;
}
