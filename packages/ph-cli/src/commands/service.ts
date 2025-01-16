import { Argument, Command } from "commander";
import { exec } from "node:child_process";
import { CommandActionType } from "../types.js";
import pm2 from "pm2";
const actions = ["start", "stop", "status", "list", "install", "save"];
const services = ["reactor", "connect", "all"];

export const manageService: CommandActionType<[string, string]> = async (
  action,
  service
) => {
  // TODO: Add error handling
  // TODO: Add service selection
  exec(
    `pm2 ${action} powerhouse-services.config.json`,
    (error, stdout, stderr) => {
      console.log(stdout);
    }
  );
};

export function serviceCommand(program: Command) {
  program
    .command("service")
    .description("Manage services")
    .addArgument(new Argument("action").choices(actions).default("list"))
    .addArgument(
      new Argument("service").choices(services).argOptional().default("all")
    )
    .action(manageService);
}
