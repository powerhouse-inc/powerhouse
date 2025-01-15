import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fork, ChildProcessWithoutNullStreams, exec } from "node:child_process";
import { Argument, Command } from "commander";
import { blue, green, red } from "colorette";
import { CommandActionType } from "../types.js";
import { DefaultReactorOptions, type ReactorOptions } from "./reactor.js";
import { type ConnectOptions } from "./connect.js";

export const manageService: CommandActionType<
  [
    {
      action: "start" | "stop" | "status" | "list";
      service: "reactor" | "connect" | "all";
    },
  ]
> = async (action: string, service: string) => {
  console.log(action, service);
  switch (action) {
    case "start":
      exec("pm2 start ecosystem.config.cjs").on("message", (message) => {
        console.log(message);
      });
      break;
    case "stop":
      exec("pm2 stop ecosystem.config.cjs");
      break;
    default:
      exec("pm2 list");
  }
};

export function serviceCommand(program: Command) {
  program
    .command("service")
    .description("Manage services")
    .addArgument(
      new Argument("action")
        .choices(["start", "stop", "status", "list"])
        .default("list")
    )
    .addArgument(
      new Argument("service")
        .choices(["reactor", "connect", "all"])
        .argRequired()
        .default("all")
    )
    .action(manageService);
}
