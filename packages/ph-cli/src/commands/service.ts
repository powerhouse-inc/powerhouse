import { Argument, Command } from "commander";
import { execSync } from "node:child_process";
import { CommandActionType } from "../types.js";
const actions = ["start", "stop", "status", "list", "install", "save"];
const services = ["reactor", "connect", "all"];

export const manageService: CommandActionType<[string, string]> = async (
  action,
  service,
) => {
  if (action === "install") {
    const result = execSync(`pm2 startup | tail -n 1`);
    const result2 = execSync(result.toString());
    console.log(result2.toString());

    return;
  } else {
    const app = service !== "all" ? `--only  ${service}` : "";
    const response = execSync(
      `pm2 ${action} ${
        ["start", "stop", "list"].includes(action)
          ? `powerhouse-services.config.json ${app}`
          : ""
      }`,
    );
    execSync(`pm2 save`);
    console.log(response.toString());
  }
};

export function serviceCommand(program: Command) {
  program
    .command("service")
    .description("Manage services")
    .addArgument(new Argument("action").choices(actions).default("list"))
    .addArgument(
      new Argument("service").choices(services).argOptional().default("all"),
    )
    .action(manageService);
}
