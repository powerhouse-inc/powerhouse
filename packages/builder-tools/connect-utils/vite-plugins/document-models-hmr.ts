import { join } from "node:path";
import type { PluginOption, ViteDevServer } from "vite";
import { IMPORT_SCRIPT_FILE } from "../constants.js";

export const viteDocumentModelsHMR = (targetDir: string): PluginOption => {
  const importPath = join(targetDir, IMPORT_SCRIPT_FILE);
  const projectRoot = process.cwd();
  const documentModelsPath = join(projectRoot, "document-models");

  function triggerDocumentModelsHMR(server: ViteDevServer) {
    // Get the external-packages module that imports our document models
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
    name: "vite-plugin-document-models-hmr",
    configureServer(server) {
      // Add document-models files to Vite's watcher
      const documentModelsIndexJs = join(documentModelsPath, "index.js");
      const documentModelsIndexTs = join(documentModelsPath, "index.ts");

      // Add the document-models files to the server's watcher
      server.watcher.add([documentModelsIndexJs, documentModelsIndexTs]);
    },
    handleHotUpdate({ file, server, modules }) {
      // Check if this is a document-models index file change
      const isDocumentModelIndex =
        file.endsWith("document-models/index.js") ||
        file.endsWith("document-models/index.ts");

      // Check if this is the external-packages.js file that gets regenerated
      const isExternalPackagesFile = file === importPath;

      // Ignore other document-models files to prevent unwanted updates
      const isOtherDocumentModelFile =
        file.includes("/document-models/") && !isDocumentModelIndex;

      if (isOtherDocumentModelFile) {
        // Return empty array to prevent any HMR for non-index files
        return [];
      }

      if (isDocumentModelIndex) {
        // Send the WebSocket event but return empty array to prevent Vite's default HMR
        triggerDocumentModelsHMR(server);
        return [];
      }

      if (isExternalPackagesFile) {
        // This file was already handled when document-models changed, don't trigger default HMR
        return [];
      }

      return modules;
    },
  };
};
