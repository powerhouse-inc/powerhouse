import { Argument, type Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serviceHelp } from "../help.js";
import { setCustomHelp } from "../utils.js";

export function setupServiceCommand(program: Command) {
  const command = program
    .command("setup-service")
    .description("Setup services")
    .action(setupServices)
    .addArgument(
      new Argument("environment", "The environment to setup")
        .default("latest")
        .choices(["latest", "dev", "staging"]),
    );

  setCustomHelp(command, serviceHelp);
}

function setupServices(environment: string) {
  const dirname =
    import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.join(
    dirname,
    "..",
    "..",
    "scripts",
    "setup-environment",
  );

  const process = spawn("bash", [scriptPath, environment], {
    stdio: "inherit", // This will pipe stdin/stdout/stderr directly to the parent process
  });

  process.on("error", (err) => {
    console.error("Failed to start process:", err);
  });

  process.on("close", (code) => {
    if (code !== 0) {
      console.error(`Process exited with code ${code}`);
    }
  });
}
