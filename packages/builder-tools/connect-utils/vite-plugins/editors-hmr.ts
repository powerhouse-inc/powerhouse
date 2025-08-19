import { join } from "node:path";
import { type PluginOption, type ViteDevServer } from "vite";
import { IMPORT_SCRIPT_FILE } from "../constants.js";

export const viteEditorsHMR = (targetDir: string): PluginOption => {
  const importPath = join(targetDir, IMPORT_SCRIPT_FILE);
  const projectRoot = process.cwd();
  const editorsPath = join(projectRoot, "editors");

  function triggerEditorsHMR(server: ViteDevServer) {
    // Get the external-packages module that imports our editors
    const externalPackagesModule = server.moduleGraph.getModuleById(importPath);

    if (externalPackagesModule) {
      // Invalidate the external-packages module to trigger re-import
      server.moduleGraph.invalidateModule(externalPackagesModule);

      // Send custom event like the external-packages plugin does
      const timestamp = Date.now();
      const eventData = {
        url: externalPackagesModule.url,
        timestamp: timestamp.toString(),
      };
      server.ws.send("studio:external-packages-updated", eventData);

      // Return the modules that should be updated
      return [
        externalPackagesModule,
        ...externalPackagesModule.importers.values(),
      ];
    }
    return [];
  }

  return {
    name: "vite-plugin-editors-hmr",
    configureServer(server) {
      // Add editors files to Vite's watcher
      const editorsIndexJs = join(editorsPath, "index.js");
      const editorsIndexTs = join(editorsPath, "index.ts");

      // Add the editors files to the server's watcher
      server.watcher.add([editorsIndexJs, editorsIndexTs]);
    },
    handleHotUpdate({ file, server, modules }) {
      // Check if this is an editors index file change
      const isEditorsIndex =
        file.endsWith("editors/index.js") ||
        file.endsWith("editors/index.ts");

      // Check if this is the external-packages.js file that gets regenerated
      const isExternalPackagesFile = file === importPath;

      // Ignore other editors files to prevent unwanted updates
      const isOtherEditorsFile =
        file.includes("/editors/") && !isEditorsIndex;

      if (isOtherEditorsFile) {
        // Return empty array to prevent any HMR for non-index files
        return [];
      }

      if (isEditorsIndex) {
        // Send the WebSocket event but return empty array to prevent Vite's default HMR
        triggerEditorsHMR(server);
        return [];
      }

      if (isExternalPackagesFile) {
        // This file was already handled when editors changed, don't trigger default HMR
        return [];
      }

      return modules;
    },
  };
};