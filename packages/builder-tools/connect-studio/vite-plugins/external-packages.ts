import { getConfig } from "@powerhousedao/config/powerhouse";
import fs from "node:fs";
import { join } from "node:path";
import { type PluginOption } from "vite";
import { viteIgnoreStaticImport, viteReplaceImports } from "./base.js";

// TODO use config path?
const __dirname = join(process.cwd(), ".ph/");
// import.meta.dirname || dirname(fileURLToPath(import.meta.url));

export const EXTERNAL_PACKAGES_IMPORT = "PH:EXTERNAL_PACKAGES";
export const IMPORT_SCRIPT_FILE = "external-packages.js";

function generateImportScript(
  packages: string[],
  targetDir: string,
  hmr: boolean,
) {
  // create file if it doesn't exist, also create path if it doesn't exist (recursive)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const scriptPath = join(targetDir, IMPORT_SCRIPT_FILE);
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

  if (hmr) {
    const moduleName = `module${counter}`;
    imports.push(`import * as ${moduleName} from '../../index.js';`);
    imports.push(`import '../../style.css';`);
    exports.push(`{
      id: "local-package",
      ...${moduleName},
    }`);
  }

  const exportStatement = `export default [
        ${exports.join(",\n")}
    ];`;

  const fileContent = `${imports.join("\n")}\n\n${exportStatement}`;
  fs.writeFileSync(scriptPath, fileContent);

  return scriptPath;
}

export const viteLoadExternalPackages = (
  packages: string[] | undefined,
  targetDir: string,
  hmr = false,
): PluginOption[] => {
  console.log("Loading external packages:");
  if (!packages?.length && !hmr) {
    return [viteIgnoreStaticImport([EXTERNAL_PACKAGES_IMPORT])];
  }

  const importScriptPath = generateImportScript(packages ?? [], targetDir, hmr);

  process.env.LOAD_EXTERNAL_PACKAGES = "true";
  return [
    viteReplaceImports({ [EXTERNAL_PACKAGES_IMPORT]: importScriptPath }),
    hmr && {
      name: "vite-plugin-studio-external-packages",
      handleHotUpdate({ file, server, modules, timestamp }) {
        console.log("FILE", file);
        if (file.endsWith("powerhouse.config.json")) {
          const config = getConfig(file);
          generateImportScript(
            config.packages?.map((p) => p.packageName) ?? [],
            targetDir,
            hmr,
          );

          config.packages?.forEach((pkg) =>
            console.log("-> Loading package:", pkg.packageName),
          );

          const module = server.moduleGraph.getModuleById(importScriptPath);

          if (module) {
            server.moduleGraph.invalidateModule(module);
            return [module].concat(...module.importers.values());
          }
        } else if (file === importScriptPath) {
          modules
            .filter(
              (module) =>
                module.id === IMPORT_SCRIPT_FILE ||
                module.id === importScriptPath,
            )
            .forEach((module) => {
              server.ws.send("studio:external-packages-updated", {
                url: module.url,
                timestamp: timestamp,
              });
            });
          return modules;
        } else if (
          !file.startsWith(targetDir) &&
          !file.includes("node_modules")
        ) {
          const config = getConfig(file);
          generateImportScript(
            config.packages?.map((p) => p.packageName) ?? [],
            targetDir,
            hmr,
          );
        }

        return modules;
      },
    },
  ];
};
