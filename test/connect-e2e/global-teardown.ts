import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function globalTeardown() {
  console.log("🧹 Running global teardown - cleaning up generated files...");

  const connectE2ERoot = __dirname;
  const documentModelsDir = path.join(connectE2ERoot, "document-models");
  const subgraphsDir = path.join(connectE2ERoot, "subgraphs");
  const downloadsDir = path.join(connectE2ERoot, "downloads");
  const editorsDir = path.join(connectE2ERoot, "editors");
  const indexFile = path.join(connectE2ERoot, "index.ts");

  try {
    // Update index.ts to use empty objects instead of imports
    if (fs.existsSync(indexFile)) {
      let indexContent = fs.readFileSync(indexFile, "utf8");

      // Replace imports with empty object constants
      indexContent = indexContent.replace(
        /import \* as documentModelsExports from "\.\/document-models\/index\.js";/,
        "const documentModelsExports = {};",
      );
      indexContent = indexContent.replace(
        /import \* as editorsExports from "\.\/editors\/index\.js";/,
        "const editorsExports = {};",
      );

      fs.writeFileSync(indexFile, indexContent, "utf8");
      console.log("✅ Updated index.ts to use empty objects");
    }

    // Clean up document-models folder
    if (fs.existsSync(documentModelsDir)) {
      fs.rmSync(documentModelsDir, { recursive: true, force: true });
      console.log("✅ Cleaned up document-models folder");
    }

    // Clean up subgraphs folder
    if (fs.existsSync(subgraphsDir)) {
      fs.rmSync(subgraphsDir, { recursive: true, force: true });
      console.log("✅ Cleaned up subgraphs folder");
    }

    // Clean up downloads folder
    if (fs.existsSync(downloadsDir)) {
      fs.rmSync(downloadsDir, { recursive: true, force: true });
      console.log("✅ Cleaned up downloads folder");
    }

    // Clean up editors folder
    if (fs.existsSync(editorsDir)) {
      fs.rmSync(editorsDir, { recursive: true, force: true });
      console.log("✅ Cleaned up editors folder");
    }

    console.log("🎯 Global teardown completed successfully!");
  } catch (error) {
    console.error("❌ Failed to clean up generated files:", error);
    // Don't throw error in teardown to avoid masking test failures
  }
}

export default globalTeardown;
