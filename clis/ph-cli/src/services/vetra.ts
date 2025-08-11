import { type ConnectStudioOptions } from "@powerhousedao/builder-tools/connect-studio";
import { getConfig } from "@powerhousedao/config/utils";
import {
  startSwitchboard as startSwitchboardServer,
  type StartServerOptions as SwitchboardStartServerOptions,
} from "@powerhousedao/switchboard/server";
import { blue, cyan, green, red } from "colorette";
import { type ChildProcessWithoutNullStreams, fork } from "node:child_process";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultReactorOptions, type ReactorOptions } from "./reactor.js";

const __dirname =
  import.meta.dirname || dirname(fileURLToPath(import.meta.url));

export type DevOptions = {
  generate?: boolean;
  watch?: boolean;
  switchboardPort?: number;
  reactorPort?: number;
  connectPort?: number;
  disableDefaultDrive?: boolean;
  configFile?: string;
  httpsKeyFile?: string;
  httpsCertFile?: string;
  verbose?: boolean;
  remoteDrive?: string;
};

const defaultVetraSwitchboardOptions: Partial<SwitchboardStartServerOptions> = {
  port: 4001,
  dbPath: path.join(process.cwd(), ".ph/read-model.db"),
  dev: true,
  drive: {
    id: "vetra",
    slug: "vetra",
    global: {
      name: "Vetra",
      icon: "https://azure-elderly-tortoise-212.mypinata.cloud/ipfs/bafkreiccw6piv55gk6pkbfzlhj2snfsncjz5fmmlue5njsukuaeapffggi",
    },
    preferredEditor: "vetra-drive-app",
    local: {
      availableOffline: true,
      listeners: [],
      sharingType: "public",
      triggers: [],
    },
  },
};

export async function startVetraSwitchboard(
  options: SwitchboardStartServerOptions,
) {
  const baseConfig = getConfig(options.configFile);

  const { https } = baseConfig.reactor ?? { https: false };

  const switchboard = await startSwitchboardServer({
    ...defaultVetraSwitchboardOptions,
    ...options,
    https,
    mcp: true,
  });

  return switchboard;
}

async function spawnLocalVetraSwitchboard(
  options?: ReactorOptions & { verbose?: boolean },
) {
  // Instead of spawning, let's start the switchboard directly
  // and simulate the spawn interface
  try {
    const {
      port: rawPort,
      configFile,
      verbose = false,
      ...restOptions
    } = options || {};
    const port =
      typeof rawPort === "string"
        ? parseInt(rawPort)
        : typeof rawPort === "number"
          ? rawPort
          : 4001;
    const switchboard = await startVetraSwitchboard({
      port,
      configFile: configFile || undefined,
      ...restOptions,
    });

    if (verbose) {
      console.log(blue(`[Vetra Switchboard]: Started successfully`));
    } else {
      console.log(`Switchboard initialized`);
      console.log(`   ➜ Drive URL: ${switchboard.defaultDriveUrl}`);
    }
    return { driveUrl: switchboard.defaultDriveUrl || "" };
  } catch (error) {
    console.error(
      red(
        `[Vetra Switchboard]: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function spawnLocalReactor(
  options?: ReactorOptions & { verbose?: boolean },
  remoteDrives?: string,
) {
  const { verbose = false, ...reactorOptions } = options || {};
  const finalOptions = {
    ...reactorOptions,
    remoteDrives: remoteDrives || "",
    mcp: false,
  };

  const child = fork(
    path.join(dirname(__dirname), "commands", "reactor.js"),
    ["spawn", JSON.stringify(finalOptions)],
    { silent: true },
  ) as ChildProcessWithoutNullStreams;

  return new Promise<{ reactorUrl: string }>((resolve) => {
    child.on("message", (message) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const text = message.toString();

      if (text.startsWith("reactorUrl:")) {
        const reactorUrl = text.substring("reactorUrl:".length);
        resolve({ reactorUrl });
      }
    });

    child.stdout.on("data", (data: Buffer) => {
      const message = data.toString();
      const lines = message.split("\n").filter((line) => line.trim().length);

      for (const line of lines) {
        if (verbose) {
          process.stdout.write(cyan(`[Reactor]: ${line}\n`));
        } else {
          // Only show specific logs when not verbose
          if (
            line.includes("🔄") ||
            line.includes("✅") ||
            line.includes("❌")
          ) {
            process.stdout.write(cyan(`[Codegen]: ${line}\n`));
          }
        }
      }
    });

    child.stderr.on("error", (data: Buffer) => {
      process.stderr.write(red(`[Reactor]: ${data.toString()}`));
    });
    child.on("error", (err) => {
      process.stderr.write(red(`[Reactor]: ${err}`));
    });

    child.on("exit", (code) => {
      if (verbose) {
        console.log(`Reactor process exited with code ${code}`);
      }
    });
  });
}

async function spawnConnect(
  options?: ConnectStudioOptions & { verbose?: boolean; connectPort?: number },
  localReactorUrl?: string,
) {
  const { verbose = false, connectPort, ...connectOptions } = options || {};

  const finalOptions = connectPort
    ? { ...connectOptions, port: connectPort.toString() }
    : connectOptions;

  const child = fork(
    path.join(dirname(__dirname), "commands", "connect.js"),
    ["spawn", JSON.stringify(finalOptions)],
    {
      silent: true,
      env: {
        ...process.env,
        PH_CONNECT_DEFAULT_DRIVES_URL: localReactorUrl,
      },
    },
  ) as ChildProcessWithoutNullStreams;

  return new Promise<void>((resolve) => {
    let connectInitialized = false;

    child.stdout.on("data", (data: Buffer) => {
      const message = data.toString();
      const lines = message.split("\n").filter((line) => line.trim().length);

      if (!connectInitialized) {
        resolve();
        connectInitialized = true;
        if (!verbose) {
          console.log(green(`[Connect]: Connect initialized`));
        }
      }

      for (const line of lines) {
        if (verbose) {
          process.stdout.write(green(`[Connect]: ${line}\n`));
        } else {
          // Only show Local and Network URLs when not verbose
          if (line.includes("➜  Local:") || line.includes("➜  Network:")) {
            process.stdout.write(green(`[Connect]: ${line}\n`));
          }
        }
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      if (verbose) {
        process.stderr.write(red(`[Connect]: ${data.toString()}`));
      }
    });

    child.on("close", (code) => {
      if (verbose) {
        console.log(`Connect process exited with code ${code}`);
      }
    });
  });
}

export async function startVetra({
  generate,
  watch,
  switchboardPort = DefaultReactorOptions.port,
  reactorPort = DefaultReactorOptions.port + 1,
  connectPort,
  disableDefaultDrive = true,
  configFile,
  verbose = false,
  remoteDrive,
}: DevOptions) {
  try {
    const baseConfig = getConfig(configFile);
    const https = baseConfig.reactor?.https;

    let driveUrl: string;

    if (remoteDrive) {
      // Use provided remote drive URL, skip switchboard
      driveUrl = remoteDrive;
      if (verbose) {
        console.log(`Using remote drive: ${remoteDrive}`);
      }
    } else {
      // Start Vetra Switchboard
      if (verbose) {
        console.log("Starting Vetra Switchboard...");
      }
      const switchboardResult = await spawnLocalVetraSwitchboard({
        generate,
        port: switchboardPort,
        watch,
        https,
        configFile,
        verbose,
      });
      driveUrl = switchboardResult.driveUrl;
    }
    if (verbose) {
      console.log("Starting Codegen Reactor...");
    }

    await spawnLocalReactor(
      {
        generate,
        port: reactorPort,
        watch,
        https,
        disableDefaultDrive,
        configFile,
        processors: ["ph/codegen/processor"],
        verbose,
      },
      driveUrl, // Pass the drive URL (either from switchboard or remote)
    );

    // Start Connect pointing to the drive
    if (verbose) {
      console.log("Starting Connect...");
      console.log(`   ➜ Connect will use drive: ${driveUrl}`);
    }
    await spawnConnect(
      connectPort
        ? { configFile, verbose, connectPort }
        : { configFile, verbose },
      driveUrl,
    );
  } catch (error) {
    console.error(error);
  }
}
