import { getConfig } from "@powerhousedao/config/powerhouse";
import { Argument, type Command } from "commander";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pm2, { type StartOptions } from "pm2";
import { type CommandActionType } from "../types.js";

const actions = ["start", "stop", "status", "list", "startup", "unstartup"];
const services = ["switchboard", "connect", "all"];

let switchboardPort = 8442;
let connectPort = 8443;
export const manageService: CommandActionType<[string, string]> = async (
  action,
  service,
) => {
  try {
    const config = getConfig();
    if (config.reactor?.port) {
      switchboardPort = config.reactor.port;
    }
    if (config.studio?.port) {
      connectPort = config.studio.port;
    }

    pm2.connect((err) => {
      switch (action) {
        case "start":
          startServices(service);
          break;
        case "stop":
          stopServices(service);
          break;
        case "startup":
          startupServices();
          break;
        case "unstartup":
          unstartupServices();
          break;
        default:
          statusServices();
          break;
      }
    });
  } catch (error) {
    console.error(error);
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

function startServices(service: string) {
  if (service === "switchboard" || service === "all") {
    const switchboardOptions: StartOptions = {
      name: "switchboard",
      script: "npx ph-cli switchboard",
    };
    console.log("Starting Switchboard...");
    pm2.start(switchboardOptions, (err) => {
      if (err) {
        console.log(err.name);
        // throw new Error(err.message);
      }

      dumpServices();
    });
    console.log("Switchboard started");
  }

  if (service === "connect" || service === "all") {
    const connectOptions: StartOptions = {
      name: "connect",
      script: "npx ph-cli connect",
      args: ["--port", connectPort.toString()],
    };
    console.log("Starting connect...");
    pm2.start(connectOptions, (err) => {
      if (err) {
        throw new Error(err.message);
      }

      dumpServices();
    });
    console.log("Connect started");
  }
}

function dumpServices() {
  pm2.dump((err) => {
    if (err) {
      throw new Error(err.message);
    }

    statusServices();
  });
}

function stopServices(service: string) {
  if (service === "all" || service === "connect") {
    pm2.stop("connect", (err) => {
      if (err) {
        throw new Error(err.message);
      }

      dumpServices();
    });
  }
  if (service === "all" || service === "switchboard") {
    pm2.stop("switchboard", (err) => {
      if (err) {
        throw new Error(err.message);
      }

      dumpServices();
    });
  }
}

function statusServices() {
  pm2.list((err, list) => {
    const formattedList = list.map((item) => {
      return {
        id: item.pm_id,
        name: item.name,
        pid: item.pid,
        uptime: item.pm2_env?.pm_uptime,
        restarts: item.pm2_env?.unstable_restarts,
        status: item.pm2_env?.status,
        mem: item.monit?.memory,
        cpu: item.monit?.cpu,
      };
    });

    console.table(formattedList);
    process.exit(0);
  });
}

function startupServices() {
  const dirname =
    import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.join(dirname, "..", "scripts", "service-startup.sh");
  const result = execSync(`bash ${scriptPath}`).toString();
  console.log(result);
  process.exit(0);
}

function unstartupServices() {
  const dirname =
    import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.join(
    dirname,
    "..",
    "scripts",
    "service-unstartup.sh",
  );
  const result = execSync(`bash ${scriptPath}`).toString();
  console.log(result);
  process.exit(0);
}
