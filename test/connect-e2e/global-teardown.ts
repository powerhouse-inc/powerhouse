import fs from "fs";
import MCR from "monocart-coverage-reports";
import path from "path";
import { fileURLToPath } from "url";
import coverageOptions from "./mcr.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function globalTeardown() {
  const mcr = MCR(coverageOptions);
  await mcr.generate();

  console.log("🧹 Running global teardown - cleaning up generated files...");

  const connectE2ERoot = __dirname;
  const documentModelsDir = path.join(connectE2ERoot, "document-models");
  const subgraphsDir = path.join(connectE2ERoot, "subgraphs");
  const downloadsDir = path.join(connectE2ERoot, "downloads");
  const editorsDir = path.join(connectE2ERoot, "editors");
  const indexFile = path.join(connectE2ERoot, "index.ts");

  try {
    // Clean up document-models folder
    if (fs.existsSync(documentModelsDir)) {
      fs.rmSync(documentModelsDir, { recursive: true, force: true });
      console.log("✅ Cleaned up document-models folder");

      // rebuild empty document-models
      fs.mkdirSync(documentModelsDir);
      fs.writeFileSync(
        path.join(documentModelsDir, "index.ts"),
        "export {};\n",
      );
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

      // rebuild empty editors
      fs.mkdirSync(editorsDir);
      fs.writeFileSync(path.join(editorsDir, "index.ts"), "export {};\n");
    }

    console.log("🎯 Global teardown completed successfully!");
  } catch (error) {
    console.error("❌ Failed to clean up generated files:", error);
    // Don't throw error in teardown to avoid masking test failures
  }
}

export default globalTeardown;
