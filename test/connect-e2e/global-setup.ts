import { execSync } from "child_process";
import MCR from "monocart-coverage-reports";
import path from "path";
import { fileURLToPath } from "url";
import coverageOptions from "./mcr.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function globalSetup() {
  console.log("🚀 Running global setup - generating document models...");

  try {
    // Run the pnpm generate command from the connect-e2e root directory
    const connectE2ERoot = __dirname;
    const indexFile = path.join(connectE2ERoot, "index.ts");

    // Generate document models from todo.phdm.zip
    const generateModelsCommand = "pnpm generate todo.phdm.zip";
    console.log(`Running: ${generateModelsCommand}`);
    console.log(`From directory: ${connectE2ERoot}`);

    execSync(generateModelsCommand, {
      cwd: connectE2ERoot,
      stdio: "inherit",
    });

    console.log("✅ Document models generated successfully!");

    // Generate ToDoList editor
    const generateEditorCommand =
      "pnpm generate --editor ToDoList --document-types powerhouse/todo";
    console.log(`Running: ${generateEditorCommand}`);
    console.log(`From directory: ${connectE2ERoot}`);

    execSync(generateEditorCommand, {
      cwd: connectE2ERoot,
      stdio: "inherit",
    });

    console.log("✅ ToDoList editor generated successfully!");

    const mcr = MCR(coverageOptions);
    mcr.cleanCache();

    console.log("🎯 Global setup completed successfully!");
  } catch (error) {
    console.error("❌ Failed to generate document models or editor:", error);
    throw error;
  }
}

export default globalSetup;
