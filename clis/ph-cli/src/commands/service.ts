import { Argument, type Command } from "commander";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serviceHelp } from "../help.js";
import { type CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

interface PackageJson {
  name: string;
  version: string;
  [key: string]: unknown;
}

const actions = ["start", "stop", "status", "setup", "restart"];

export const manageService: CommandActionType<[string]> = async (action) => {
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
};

export function serviceCommand(program: Command) {
  const command = program
    .command("service")
    .description("Manage environment services")
    .addArgument(new Argument("action").choices(actions).default("status"))
    .action(manageService);

  setCustomHelp(command, serviceHelp);
}
