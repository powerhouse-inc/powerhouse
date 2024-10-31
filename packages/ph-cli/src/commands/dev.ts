import { Command } from "commander";
import path from "path";
import { spawn } from "child_process";
import { green, red } from "colorette";
import fs from "fs";

import { CommandActionType } from "../types";

const CONNECT_BIN_PATH = "node_modules/.bin/connect";
const REACTOR_LOCAL_BIN_PATH = "node_modules/.bin/reactor-local";

const spawnChild = (binPath: string) => {
  const name = binPath.split("/").pop();
  let tmpPath = binPath;
  if (!fs.existsSync(binPath)) {
    const packagePath = require.resolve(`@powerhousedao/${name}/package.json`);
    const packageDir = path.dirname(packagePath);
    tmpPath = path.join(packageDir, binPath);
  }
  const child = spawn(tmpPath);

  child.stdout.on("data", (data: Buffer) => {
    green(data.toString());
    process.stdout.write(green(`[${name}]: ${data.toString()}`));
  });

  child.stderr.on("data", (data: Buffer) => {
    process.stderr.write(red(`[${name}]: ${data.toString()}`));
  });

  child.on("close", (code) => {
    console.log(`${name} process exited with code ${code}`);
  });

  return child;
};

export const dev: CommandActionType<[{ projectPath?: string }]> = ({
  projectPath,
}) => {
  let connectBinPath = path.join(projectPath || ".", CONNECT_BIN_PATH);
  let reactorLocalBinPath = path.join(
    projectPath || ".",
    REACTOR_LOCAL_BIN_PATH
  );

  spawnChild(connectBinPath);
  spawnChild(reactorLocalBinPath);
};

export function devCommand(program: Command) {
  program
    .command("dev")
    .description("Starts dev environment")
    .option("--project-path <type>", "path to the project")
    .action(dev);
}
