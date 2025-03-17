import { exec } from "node:child_process";
import { join } from "node:path";
import { normalizePath, type PluginOption, type ViteDevServer } from "vite";
import { HMR_MODULE_IMPORT, viteReplaceImports } from "./base.js";

export const viteLoadHMRModule = (connectPath: string): PluginOption => {
  return [
    viteReplaceImports({
      [HMR_MODULE_IMPORT]: normalizePath(join(connectPath, "hmr.js")),
    }),
    {
      name: "vite-plugin-studio-hmr-module",
      configureServer(server) {
        handleExternalPackageEvents(server);
      },
    },
  ];
};

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
