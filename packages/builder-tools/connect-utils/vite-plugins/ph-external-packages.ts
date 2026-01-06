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
    css: pkg + "/style.css",
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
    handleHotUpdate(ctx) {
      // Skip HMR for modules that are only imported by style.css
      return ctx.modules.filter((mod) => {
        if (mod.importers.size === 1) {
          const importer = mod.importers.values().next().value;
          if (importer?.url === "/style.css") {
            return false;
          }
        }
        return true;
      });
    },
  };

  return plugin;
}
