import fs from "fs";
import MCR from "monocart-coverage-reports";
import path from "path";
import { fileURLToPath } from "url";
import coverageOptions from "./mcr.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMPTY_MANIFEST = {
  name: "",
  description: "",
  category: "",
  publisher: {
    name: "",
    url: "",
  },
  documentModels: [],
  editors: [],
  apps: [],
  subgraphs: [],
  importScripts: [],
};

/**
 * Clean up a directory by removing all subdirectories and .ts files except index.ts
 * and optionally recreating index.ts with empty export
 */
function cleanupDirectory(
  dirPath: string,
  recreateIndex: boolean = true,
): void {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const preservedFiles = ["index.ts", "document-models.ts", "editors.ts"];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Remove all subdirectories
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !preservedFiles.includes(entry.name)
    ) {
      // Remove .ts files except preserved ones
      fs.rmSync(fullPath, { force: true });
    }
  }

  if (recreateIndex) {
    const indexPath = path.join(dirPath, "index.ts");
    fs.writeFileSync(indexPath, "export {};\n", "utf8");
  }
}

/**
 * Remove a directory completely
 */
function removeDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Reset powerhouse.manifest.json to empty state
 */
function resetManifest(manifestPath: string): void {
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(EMPTY_MANIFEST, null, 4) + "\n",
    "utf8",
  );
}

/**
 * Reset base state files to their initial content
 */
function resetBaseStateFiles(
  dirPath: string,
  fileName: string,
  content: string,
): void {
  const filePath = path.join(dirPath, fileName);
  if (fs.existsSync(dirPath)) {
    fs.writeFileSync(filePath, content, "utf8");
  }
}

async function globalTeardown() {
  const mcr = MCR(coverageOptions);
  await mcr.generate();

  console.log("🧹 Running global teardown - cleaning up test artifacts...");

  const vetraE2ERoot = __dirname;

  try {
    // Clean up generated code directories (remove subdirs, recreate empty index.ts)
    const documentModelsDir = path.join(vetraE2ERoot, "document-models");
    cleanupDirectory(documentModelsDir, true);
    resetBaseStateFiles(
      documentModelsDir,
      "document-models.ts",
      'import type { DocumentModelModule } from "document-model";\n\nexport const documentModels: DocumentModelModule<any>[] = [];\n',
    );
    console.log("✅ Cleaned up document-models folder");

    const editorsDir = path.join(vetraE2ERoot, "editors");
    cleanupDirectory(editorsDir, true);
    resetBaseStateFiles(
      editorsDir,
      "editors.ts",
      'import type { EditorModule } from "document-model";\n\nexport const editors: EditorModule[] = [];\n',
    );
    console.log("✅ Cleaned up editors folder");

    cleanupDirectory(path.join(vetraE2ERoot, "processors"), true);
    console.log("✅ Cleaned up processors folder");

    cleanupDirectory(path.join(vetraE2ERoot, "subgraphs"), true);
    console.log("✅ Cleaned up subgraphs folder");

    // Remove state and temporary directories completely
    removeDirectory(path.join(vetraE2ERoot, ".ph"));
    console.log("✅ Removed .ph directory");

    removeDirectory(path.join(vetraE2ERoot, "backup-documents"));
    console.log("✅ Removed backup-documents directory");

    removeDirectory(path.join(vetraE2ERoot, "downloads"));
    console.log("✅ Removed downloads directory");

    // Reset manifest to empty state
    const manifestPath = path.join(vetraE2ERoot, "powerhouse.manifest.json");
    resetManifest(manifestPath);
    console.log("✅ Reset powerhouse.manifest.json to empty state");

    console.log("🎯 Global teardown completed successfully!");
  } catch (error) {
    console.error("❌ Failed to clean up test artifacts:", error);
    // Don't throw error in teardown to avoid masking test failures
  }
}

export default globalTeardown;
