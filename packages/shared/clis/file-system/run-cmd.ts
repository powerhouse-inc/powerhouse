import { execSync } from "child_process";

export function runCmd(command: string, options: { cwd?: string } = {}) {
  try {
    execSync(command, { stdio: "inherit", cwd: options.cwd });
  } catch (error) {
    console.log("\x1b[31m", error, "\x1b[0m");
    throw error;
  }
}
