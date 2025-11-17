import { join } from "path";
import type { ModuleNode, PluginOption } from "vite";

/**
 * Takes a list of Powerhouse project packages, by name or path and
 * returns a js module that exports those packages for use in Connect.
 */
function makeImportScriptFromPackages(
  packages: string[],
  localPackage?: string,
) {
  const packageImports = packages.map((pkg) => ({
    name: pkg,
    js: pkg,
    css: pkg,
  }));

  if (localPackage) {
    packageImports.push({
      name: localPackage,
      js: join(localPackage, "/index.ts"),
      css: join(localPackage, "/style.css"),
    });
  }

  return `
   export async function loadExternalPackages() {
      const modules = [];
      ${packageImports
        .map(
          (pkg, index) =>
            `try {
          const module = await import('${pkg.js}');
          await import('${pkg.css}');
          modules.push({
              id: 'module${index}',
              ...module,
          });
      } catch (error) {
          console.error("Error loading package: '${pkg.name}'", error);
      }`,
        )
        .join("\n")}
      return modules;
    }
  `;
}

export function phExternalPackagesPlugin(
  phPackages: string[],
  localPackage?: string,
) {
  const virtualModuleId = "virtual:ph:external-packages";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  function isSameModule(moduleA: ModuleNode, moduleB: ModuleNode) {
    return (
      moduleA === moduleB ||
      moduleA.id === moduleB.id ||
      moduleA.url === moduleB.url ||
      (moduleA.file && moduleA.file === moduleB.file)
    );
  }

  function isImported(module: ModuleNode, rootModule: ModuleNode) {
    if (isSameModule(module, rootModule)) return true;

    const importers = module.importers
      .values()
      .filter(
        (m) => m.file && !m.file.endsWith(".html") && !m.file.endsWith(".css"),
      );
    if (importers.some((m) => isImported(m, rootModule))) return true;

    if (importers.some((m) => isImported(m, rootModule))) return true;

    return false;
  }

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
        return makeImportScriptFromPackages(phPackages, localPackage);
      }
    },
    handleHotUpdate({ file, server, modules, timestamp }) {
      const virtualModule = server.moduleGraph.getModuleById(
        resolvedVirtualModuleId,
      );
      if (!virtualModule) {
        return [];
      }

      let refreshVirtualModule = false;
      const modulesToRefresh: ModuleNode[] = [];

      for (const module of modules) {
        if (!isImported(module, virtualModule)) {
          // returns only modules that are actually imported by Connect
          continue;
        }

        // lets react modules be handled by react-refresh
        if (module.file?.endsWith(".tsx") || module.file?.endsWith(".jsx")) {
          modulesToRefresh.push(module);
        } else {
          // invalidates non-react modules to trigger HMR
          server.moduleGraph.invalidateModule(
            module,
            new Set(),
            timestamp,
            true,
          );
        }
        refreshVirtualModule = true;
      }

      // if a module was invalidated then triggers HMR on the external packages module
      if (refreshVirtualModule) {
        modulesToRefresh.push(virtualModule);
      }

      return modulesToRefresh;
    },
  };

  return plugin;
}
