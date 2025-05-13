import { getConfig } from "@powerhousedao/config/utils";
import { exec } from "node:child_process";
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type PluginOption, type ViteDevServer } from "vite";

export const EXTERNAL_PACKAGES_IMPORT = "PH:EXTERNAL_PACKAGES";
export const IMPORT_SCRIPT_FILE = "external-packages.js";
export const LOCAL_PACKAGE_ID = "ph:local-package";

const LOCAL_CSS = "../../style.css";
const LOCAL_JS = "../../index.js";

function generateImportScript(
  packages: string[],
  targetPath: string,
  localPackage: boolean,
) {
  // create file if it doesn't exist, also create path if it doesn't exist (recursive)
  const targetDir = dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
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

  if (localPackage) {
    const hasModule =
      fs.existsSync(resolve(targetDir, LOCAL_JS)) ||
      fs.existsSync(resolve(targetDir, LOCAL_JS.replace(".js", ".ts")));
    const hasStyles = fs.existsSync(resolve(targetDir, LOCAL_CSS));
    if (hasStyles) {
      imports.push(`import '${LOCAL_CSS}';`);
    }
    if (hasModule) {
      const moduleName = `module${counter}`;
      imports.push(`import * as ${moduleName} from '${LOCAL_JS}';`);
      exports.push(`{
        id: "${LOCAL_PACKAGE_ID}",
        ...${moduleName},
      }`);
    }
  }

  const exportStatement = `export default [
        ${exports.join(",\n")}
    ];`;

  const fileContent = `${imports.join("\n")}\n\n${exportStatement}`;
  fs.writeFileSync(targetPath, fileContent);

  return targetPath;
}

const handleExternalPackageEvents = (server: ViteDevServer) => {
  server.ws.on("studio:add-external-package", (data, client) => {
    const { name } = data as { name: string };
    const installProcess = exec(
      `ph install ${name}`,
      {
        cwd: process.cwd(),
      },
      (error) => {
        if (error) {
          console.error(`\t[${name}]: ${error.message}`);
        } else {
          server.ws.send("studio:external-package-added", {
            name,
          });
        }
      },
    );
    installProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`\t[${name}]: ${data.toString().trim()}`);
    });
    console.log("Installing external package:", name);
  });

  server.ws.on("studio:remove-external-package", (data, client) => {
    const { name } = data as { name: string };
    const uninstallProcess = exec(
      `ph uninstall ${name}`,
      {
        cwd: process.cwd(),
      },
      (error) => {
        if (error) {
          console.error(`\t[${name}]: ${error.message}`);
        } else {
          server.ws.send("studio:external-package-removed", {
            name,
          });
        }
      },
    );
    uninstallProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`\t[${name}]: ${data.toString().trim()}`);
    });
    console.log("Removing external package:", name);
  });
};

export const viteLoadExternalPackages = (
  localPackage: boolean,
  packages: string[] | undefined,
  targetDir: string,
): PluginOption[] => {
  const importPath = join(targetDir, IMPORT_SCRIPT_FILE);
  packages = packages?.filter((p) => p.trim().length) ?? [];

  return [
    {
      name: "vite-plugin-ph-external-packages",
      config() {
        if (!localPackage) {
          generateImportScript(packages, importPath, localPackage);
        }
      },
      closeBundle() {
        generateImportScript(packages, importPath, localPackage);
      },
      configureServer(server) {
        generateImportScript(packages, importPath, localPackage);
        handleExternalPackageEvents(server);
      },
      handleHotUpdate({ file, server, modules, timestamp }) {
        if (file.endsWith("powerhouse.config.json")) {
          const config = getConfig(file);
          generateImportScript(
            config.packages?.map((p) => p.packageName) ?? [],
            importPath,
            true,
          );

          config.packages?.forEach((pkg) =>
            console.log("-> Loading package:", pkg.packageName),
          );

          const module = server.moduleGraph.getModuleById(importPath);

          if (module) {
            server.moduleGraph.invalidateModule(module);
            return [module].concat(...module.importers.values());
          }
        } else if (file === importPath) {
          modules
            .filter((module) => module.id === importPath)
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
            importPath,
            localPackage,
          );
        }
        return modules;
      },
    },
  ];
};
