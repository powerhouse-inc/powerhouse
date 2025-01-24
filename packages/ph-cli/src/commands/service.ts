import { Argument, Command } from "commander";
import { execSync, spawn } from "node:child_process";
import { CommandActionType } from "../types.js";
import pm2, { StartOptions } from "pm2";
import { getConfig, PowerhouseConfig } from "@powerhousedao/config/powerhouse";

const actions = ["start", "stop", "status", "list", "install", "save"];
const services = ["reactor", "connect"];

let reactorPort = 8442;
let connectPort = 8443;
let https = false;
let host = false;
export const manageService: CommandActionType<
  [string, string, { port?: string; host?: boolean; https?: boolean }]
> = async (action, service, args) => {
  try {
    const config = getConfig();
    if (config.reactor?.port) {
      reactorPort = config.reactor.port;
    }
    if (config.studio?.port) {
      connectPort = config.studio.port;
    }
    if (args.port) {
      if (service === "reactor") {
        reactorPort = parseInt(args.port);
      } else if (service === "connect") {
        connectPort = parseInt(args.port);
      }
    }
    if (args.https) {
      https = args.https;
    }
    if (args.host) {
      host = args.host;
    }

    pm2.connect((err) => {
      switch (action) {
        case "start":
          startServices(service);
          break;
        case "stop":
          stopServices(service);
          break;
        case "status":
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
      new Argument("service")
        .choices(services)
        .argOptional()
        .default("reactor"),
    )
    .option("-p, --port <port>", "Port to run the server on", "3000")
    .option("-h, --host", "Expose the server to the network")
    .option("--https", "Enable HTTPS")
    .action(manageService);
}

function startServices(service: string) {
  if (service === "reactor" || service === "all") {
    const reactorOptions: StartOptions = {
      name: "reactor",
      script: "npx ph-cli reactor",
      args: [
        "--port",
        reactorPort.toString(),
        "--host",
        host.toString() ?? "localhost",
        "--https",
        https.toString(),
      ],
    };
    console.log("Starting reactor...");
    pm2.start(reactorOptions, (err) => {
      if (err) {
        console.log(err.name);
        // throw new Error(err.message);
      }

      dumpServices();
    });
    console.log("Reactor started");
  }

  if (service === "connect" || service === "all") {
    const connectOptions: StartOptions = {
      name: "connect",
      script: "npx ph-cli connect",
      args: [
        "--port",
        connectPort.toString(),
        "--host",
        host.toString() ?? "localhost",
        "--https",
        https.toString(),
      ],
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
  if (service === "all" || service === "reactor") {
    pm2.stop("reactor", (err) => {
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
