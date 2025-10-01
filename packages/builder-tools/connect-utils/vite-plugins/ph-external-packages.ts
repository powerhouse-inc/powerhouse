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

  const fileContent = `${imports.join("\n")}\n\n${exportStatement}`;

  return fileContent;
}

export function phExternalPackagesPlugin(phPackages: string[]) {
  const plugin: PluginOption = {
    name: "ph-external-packages",
    enforce: "pre",
    resolveId(id) {
      if (id === "ph:external-packages") {
        return "ph:external-packages";
      }
    },
    load(id) {
      if (id === "ph:external-packages") {
        return makeImportScriptFromPackages(phPackages);
      }
    },
  };

  return plugin;
}
