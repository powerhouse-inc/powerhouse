import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function globalTeardown() {
  console.log("🧹 Running global teardown - cleaning up generated files...");
  
  const connectE2ERoot = __dirname;
  const documentModelsDir = path.join(connectE2ERoot, "document-models");
  const subgraphsDir = path.join(connectE2ERoot, "subgraphs");
  const downloadsDir = path.join(connectE2ERoot, "downloads");
  
  try {
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
    
    console.log("🎯 Global teardown completed successfully!");
  } catch (error) {
    console.error("❌ Failed to clean up generated files:", error);
    // Don't throw error in teardown to avoid masking test failures
  }
}

export default globalTeardown; 