import { getConfig } from "@powerhousedao/config/utils";
import { exec } from "node:child_process";
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type PluginOption, type ViteDevServer } from "vite";
import { IMPORT_SCRIPT_FILE } from "../constants.js";
import { makeImportScriptFromPackages } from "../helpers.js";

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

  const hasModule =
    localPackage &&
    (fs.existsSync(resolve(targetDir, LOCAL_JS)) ||
      fs.existsSync(resolve(targetDir, LOCAL_JS.replace(".js", ".ts"))));
  const hasStyles =
    localPackage && fs.existsSync(resolve(targetDir, LOCAL_CSS));
  const localJsPath = hasModule ? LOCAL_JS : undefined;
  const localCssPath = hasStyles ? LOCAL_CSS : undefined;

  const fileContent = makeImportScriptFromPackages({
    packages,
    localJsPath,
    localCssPath,
  });
  fs.writeFileSync(targetPath, fileContent.trim());

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
                timestampUtcMs: timestamp,
              });
            });
          return modules;
        } else if (
          !file.startsWith(targetDir) &&
          !file.includes("node_modules")
        ) {
          // When local files change, use the project's config file path instead of the changed file
          const configPath = join(process.cwd(), "powerhouse.config.json");
          const config = getConfig(configPath);
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
