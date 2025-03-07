import { getConfig } from "@powerhousedao/config/powerhouse";
import fs from "node:fs";
import { join } from "node:path";
import { PluginOption } from "vite";
import { viteIgnoreStaticImport, viteReplaceImports } from "./base.js";

// TODO use config path?
const __dirname = join(process.cwd(), ".ph/");
// import.meta.dirname || dirname(fileURLToPath(import.meta.url));

export const EXTERNAL_PACKAGES_IMPORT = "PH:EXTERNAL_PACKAGES";
export const IMPORT_SCRIPT_FILE = "external-packages.js";

function generateImportScript(packages: string[], targetDir: string) {
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
    counter++;
  }

  const exportStatement = `export default [
        ${moduleNames
          .map(
            (name, index) => `{
            id: "${packages[index]}",
            ...${name},
        }`,
          )
          .join(",\n")}
    ];`;

  const fileContent = `${imports.join("\n")}\n\n${exportStatement}`;
  fs.writeFileSync(scriptPath, fileContent);

  return scriptPath;
}

export const viteLoadExternalPackages = (
  packages: string[] | undefined,
  targetDir: string,
  hmr = false,
): PluginOption => {
  if (!packages?.length && !hmr) {
    return viteIgnoreStaticImport([EXTERNAL_PACKAGES_IMPORT]);
  }

  const importScriptPath = generateImportScript(packages ?? [], targetDir);

  process.env.LOAD_EXTERNAL_PACKAGES = "true";
  return [
    viteReplaceImports({ [EXTERNAL_PACKAGES_IMPORT]: importScriptPath }),
    hmr && {
      name: "vite-plugin-studio-external-packages",
      handleHotUpdate({ file, server, modules }) {
        if (file.endsWith("powerhouse.config.json")) {
          const config = getConfig(file);
          generateImportScript(
            config.packages?.map((p) => p.packageName) ?? [],
            targetDir,
          );

          config.packages?.forEach((pkg) =>
            console.log("-> Loading package:", pkg.packageName),
          );

          const module = server.moduleGraph.getModuleById(IMPORT_SCRIPT_FILE);

          if (module) {
            server.moduleGraph.invalidateModule(module);
            return [module].concat(...module.importers.values());
          }
        } else if (file === IMPORT_SCRIPT_FILE) {
          modules
            .filter((module) => module.id === IMPORT_SCRIPT_FILE)
            .forEach((module) => {
              server.ws.send("studio:external-packages-updated", {
                url: module.url,
                timestamp: module.lastHMRTimestamp,
              });
            });
          return modules;
        }

        return modules;
      },
    },
  ];
};
