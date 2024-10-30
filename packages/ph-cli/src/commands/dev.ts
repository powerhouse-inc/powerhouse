import { Command } from "commander";
import path from "path";
import { spawn } from "child_process";
import { green, red } from "colorette";
import fs from "fs";

import { CommandActionType } from "../types";

const CONNECT_BIN_PATH = "node_modules/.bin/connect";
const REACTOR_LOCAL_BIN_PATH = "node_modules/.bin/reactor-local";

export const dev: CommandActionType<[{ projectPath?: string }]> = ({
  projectPath,
}) => {
  let connectBinPath = path.join(projectPath || ".", CONNECT_BIN_PATH);
  let reactorLocalBinPath = path.join(
    projectPath || ".",
    REACTOR_LOCAL_BIN_PATH
  );

  if (!fs.existsSync(connectBinPath)) {
    const packagePath = require.resolve("@powerhousedao/connect/package.json");
    const packageDir = path.dirname(packagePath);

    connectBinPath = path.join(packageDir, CONNECT_BIN_PATH);
  }

  if (!fs.existsSync(reactorLocalBinPath)) {
    const packagePath = require.resolve(
      "@powerhousedao/reactor-local/package.json"
    );
    const packageDir = path.dirname(packagePath);

    reactorLocalBinPath = path.join(packageDir, REACTOR_LOCAL_BIN_PATH);
  }

  const connectChild = spawn(connectBinPath);
  const reactorLocalChild = spawn(reactorLocalBinPath);

  connectChild.stdout.on("data", (data: Buffer) => {
    green(data.toString());
    process.stdout.write(green(`[Connect]: ${data.toString()}`));
  });

  connectChild.stderr.on("data", (data: Buffer) => {
    process.stderr.write(red(`[Connect]: ${data.toString()}`));
  });

  connectChild.on("close", (code) => {
    console.log(`Connect process exited with code ${code}`);
  });

  reactorLocalChild.stdout.on("data", (data: Buffer) => {
    green(data.toString());
    process.stdout.write(green(`[Reactor Local]: ${data.toString()}`));
  });

  reactorLocalChild.stderr.on("data", (data: Buffer) => {
    process.stderr.write(red(`[Reactor Local]: ${data.toString()}`));
  });

  reactorLocalChild.on("close", (code) => {
    console.log(`Reactor Local process exited with code ${code}`);
  });
};

export function devCommand(program: Command) {
  program
    .command("dev")
    .description("Starts dev environment")
    .option("--project-path <type>", "path to the project")
    .action(dev);
}
