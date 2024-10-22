import { Command } from "commander";
import path from "path";
import { spawn } from "child_process";
import { green, red } from "colorette";
import fs from "fs";

import { CommandActionType } from "../types";

const CONNECT_BIN_PATH = "node_modules/.bin/connect";

export const dev: CommandActionType<[{ projectPath?: string }]> = ({
  projectPath,
}) => {
  let binPath = path.join(projectPath || ".", "node_modules/.bin/connect");

  if (!fs.existsSync(binPath)) {
    const packagePath = require.resolve("@powerhousedao/connect/package.json");
    const packageDir = path.dirname(packagePath);

    binPath = path.join(packageDir, CONNECT_BIN_PATH);
  }

  const child = spawn(binPath);

  child.stdout.on("data", (data: Buffer) => {
    green(data.toString());
    process.stdout.write(green(`[Connect]: ${data.toString()}`));
  });

  child.stderr.on("data", (data: Buffer) => {
    process.stderr.write(red(`[Connect]: ${data.toString()}`));
  });

  child.on("close", (code) => {
    console.log(`Connect process exited with code ${code}`);
  });
};

export function devCommand(program: Command) {
  program
    .command("dev")
    .description("Starts dev environment")
    .option("--project-path <type>", "path to the project")
    .action(dev);
}
