import { Command } from "commander";
import path from "path";
import { spawn } from "child_process";
import { green, red } from "colorette";

import { CommandActionType } from "../types";

export const dev: CommandActionType<[]> = () => {
  const packagePath = require.resolve("@powerhousedao/connect/package.json");
  const packageDir = path.dirname(packagePath);
  const binPath = path.join(packageDir, "node_modules/.bin/connect");

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
  program.command("dev").description("Starts dev environment").action(dev);
}
