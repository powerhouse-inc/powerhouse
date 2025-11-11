import type { ModuleNode, PluginOption } from "vite";

/**
 * Takes a list of Powerhouse project packages, by name or path and
 * returns a js module that exports those packages for use in Connect.
 */
function makeImportScriptFromPackages(packages: string[]) {
  return `
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
          console.error("Error loading package: '${pkg}'", error);
      }`,
        )
        .join("\n")}
      return modules;
    }
  `;
}

export function phExternalPackagesPlugin(phPackages: string[]) {
  const virtualModuleId = "virtual:ph:external-packages";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  const localPackageModules = new Map<string, Set<ModuleNode["url"]>>();

  /**
   * Checks if a module should be skipped based on the following conditions:
   * - It is not a file
   * - It is a node_modules file
   * - It is already in the set of imported modules
   * - It is not part of the local package
   */
  function shouldSkipModule(
    module: ModuleNode,
    rootPath: string,
    allModules: Set<string>,
  ) {
    return (
      !module.file ||
      module.file.includes("node_modules") ||
      allModules.has(module.file) ||
      (!module.file.startsWith(rootPath) &&
        module.file !== resolvedVirtualModuleId)
    );
  }

  /**
   * Recursively builds a set of imported modules for a given module.
   * @param currentModule The module to build the set for.
   * @param rootPath The root path of the local package.
   * @param allModules The set of imported modules.
   */
  function buildImportedModulesSet(
    currentModule: ModuleNode,
    rootPath: string,
    allModules: Set<string>,
  ) {
    const isVirtualModule = currentModule.file === resolvedVirtualModuleId;
    const skipModule = shouldSkipModule(currentModule, rootPath, allModules);
    if (skipModule) {
      return;
    }

    if (!isVirtualModule) {
      allModules.add(currentModule.file!);
    }
    if (
      currentModule.file?.endsWith(".css") ||
      currentModule.file?.endsWith(".html")
    ) {
      return;
    }

    for (const importer of currentModule.importedModules) {
      if (!shouldSkipModule(importer, rootPath, allModules)) {
        buildImportedModulesSet(importer, rootPath, allModules);
      }
    }
    return allModules;
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
        return makeImportScriptFromPackages(phPackages);
      }
    },
    handleHotUpdate({ file, server, modules, timestamp }) {
      // Check if the changed file is part of any local package
      const localPackage = phPackages.find((pkg) => {
        if (pkg.startsWith("/") || pkg.startsWith(".")) {
          return file.startsWith(pkg);
        }
        return false;
      });

      // if the changed file is not part of any local package, do not override HMR
      if (!localPackage) {
        return undefined;
      }

      // iterate through all local package imports to build set of imported modules, if not already built
      const packageModules = localPackageModules.get(localPackage);
      const importedModules =
        localPackageModules.get(localPackage) || new Set<string>();
      const virtualModule = server.moduleGraph.getModuleById(
        resolvedVirtualModuleId,
      );

      if (
        virtualModule &&
        !packageModules &&
        virtualModule.importedModules.size > 0 // wait for virtual module to be built
      ) {
        buildImportedModulesSet(virtualModule, localPackage, importedModules);
        localPackageModules.set(localPackage, importedModules);
      }

      // checks if there are new modules being imported by a watched module and adds them to the set
      for (const module of modules) {
        if (
          module.file &&
          !importedModules.has(module.file) &&
          !shouldSkipModule(module, localPackage, importedModules) &&
          module.importers
            .values()
            .some(
              (m) =>
                m.file &&
                !m.file.endsWith(".css") &&
                importedModules.has(m.file),
            )
        ) {
          buildImportedModulesSet(module, localPackage, importedModules);
        }
      }

      let refreshVirtualModule = false;
      const modulesToRefresh: ModuleNode[] = [];

      for (const module of modules) {
        if (
          !(
            module.id &&
            module.id !== resolvedVirtualModuleId &&
            module.file &&
            importedModules.has(module.file)
          )
        ) {
          // returns only modules that are actually imported by Connect
          continue;
        }

        // lets react modules be handled by react-refresh
        if (module.file.endsWith(".tsx") || module.file.endsWith(".jsx")) {
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
      if (refreshVirtualModule && virtualModule) {
        modulesToRefresh.push(virtualModule);
      }

      return modulesToRefresh;
    },
  };

  return plugin;
}
