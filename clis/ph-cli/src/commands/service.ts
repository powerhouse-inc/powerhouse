import { serviceArgs, type ServiceAction } from "@powerhousedao/common/clis";
import { command } from "cmd-ts";
import { execSync } from "node:child_process";
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PackageJson } from "read-pkg";

export const service = command({
  name: "service",
  description: `  
The service command manages Powerhouse services, allowing you to start, stop, check status,
and more. It provides a centralized way to control the lifecycle of services in your project.

This command:
1. Controls service lifecycle (start, stop, status, etc.)
2. Manages multiple services from a single interface
3. Provides detailed information about running services
4. Uses PM2 under the hood for process management`,
  args: serviceArgs,
  handler: (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { action = "status" } = args;
    manageService(action);
  },
});

function manageService(action: ServiceAction) {
  try {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const manageScriptPath = path.join(
      dirname,
      "..",
      "..",
      "scripts",
      "manage-environment",
    );
    const setupScriptPath = path.join(
      dirname,
      "..",
      "..",
      "scripts",
      "setup-environment",
    );

    // Read project name from package.json
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, "utf-8"),
    ) as PackageJson;
    const projectName = packageJson.name;

    switch (action) {
      case "start":
        console.log("Starting environment...");
        execSync(`bash ${manageScriptPath} ${projectName} start`, {
          stdio: "inherit",
        });
        break;

      case "stop":
        console.log("Stopping environment...");
        execSync(`bash ${manageScriptPath} ${projectName} stop`, {
          stdio: "inherit",
        });
        break;

      case "restart":
        console.log("Restarting environment...");
        execSync(`bash ${manageScriptPath} ${projectName} restart`, {
          stdio: "inherit",
        });
        break;

      case "status":
        console.log("Checking environment status...");
        execSync(`bash ${manageScriptPath} ${projectName} status`, {
          stdio: "inherit",
        });
        break;

      case "setup":
        console.log("Setting up environment...");
        execSync(`bash ${setupScriptPath} "dev" ${projectName}`, {
          stdio: "inherit",
        });
        break;

      default:
        console.log("Unknown action:", action);
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}
