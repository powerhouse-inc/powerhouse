import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function globalSetup() {
  console.log("🚀 Running global setup - generating document models...");
  
  try {
    // Run the pnpm generate command from the connect-e2e root directory
    const connectE2ERoot = __dirname;
    const command = "pnpm generate todo.phdm.zip";
    
    console.log(`Running: ${command}`);
    console.log(`From directory: ${connectE2ERoot}`);
    
    execSync(command, {
      cwd: connectE2ERoot,
      stdio: "inherit",
    });
    
    console.log("✅ Document models generated successfully!");
  } catch (error) {
    console.error("❌ Failed to generate document models:", error);
    throw error;
  }
}

export default globalSetup; 