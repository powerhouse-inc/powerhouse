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
  disableDefaultDrive?: boolean;
  configFile?: string;
  httpsKeyFile?: string;
  httpsCertFile?: string;
};

const defaultVetraSwitchboardOptions: Partial<SwitchboardStartServerOptions> = {
  port: 4001,
  dbPath: path.join(process.cwd(), ".ph/read-model.db"),
  drive: {
    id: "vetra",
    slug: "vetra",
    global: {
      name: "Vetra",
      icon: "https://ipfs.io/ipfs/QmcaTDBYn8X2psGaXe7iQ6qd8q6oqHLgxvMX9yXf7f9uP7",
    },
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
  });

  return switchboard;
}

async function spawnLocalVetraSwitchboard(options?: ReactorOptions) {
  // Instead of spawning, let's start the switchboard directly
  // and simulate the spawn interface
  try {
    const { port: rawPort, configFile, ...restOptions } = options || {};
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

    console.log(blue(`[Vetra Switchboard]: Started successfully`));
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

function spawnLocalReactor(options?: ReactorOptions, remoteDrives?: string) {
  const reactorOptions = {
    ...options,
    remoteDrives: remoteDrives || "",
  };

  const child = fork(
    path.join(dirname(__dirname), "commands", "reactor.js"),
    ["spawn", JSON.stringify(reactorOptions)],
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
        process.stdout.write(cyan(`[Reactor]: ${line}\n`));
      }
    });

    child.stderr.on("error", (data: Buffer) => {
      process.stderr.write(red(`[Reactor]: ${data.toString()}`));
    });
    child.on("error", (err) => {
      process.stderr.write(red(`[Reactor]: ${err}`));
    });

    child.on("exit", (code) => {
      console.log(`Reactor process exited with code ${code}`);
    });
  });
}

async function spawnConnect(
  options?: ConnectStudioOptions,
  localReactorUrl?: string,
) {
  const child = fork(
    path.join(dirname(__dirname), "commands", "connect.js"),
    ["spawn", JSON.stringify(options ?? {})],
    {
      silent: true,
      env: {
        ...process.env,
        PH_CONNECT_DEFAULT_DRIVES_URL: localReactorUrl,
      },
    },
  ) as ChildProcessWithoutNullStreams;

  return new Promise<void>((resolve) => {
    child.stdout.on("data", (data: Buffer) => {
      resolve();
      process.stdout.write(green(`[Connect]: ${data.toString()}`));
    });

    child.stderr.on("data", (data: Buffer) => {
      process.stderr.write(red(`[Connect]: ${data.toString()}`));
    });

    child.on("close", (code) => {
      console.log(`Connect process exited with code ${code}`);
    });
  });
}

export async function startVetra({
  generate,
  watch,
  switchboardPort = DefaultReactorOptions.port,
  reactorPort = DefaultReactorOptions.port + 1,
  disableDefaultDrive = true,
  configFile,
}: DevOptions) {
  try {
    const baseConfig = getConfig(configFile);
    const https = baseConfig.reactor?.https;

    // Start Vetra Switchboard
    console.log("Starting Vetra Switchboard...");
    const { driveUrl } = await spawnLocalVetraSwitchboard({
      generate,
      port: switchboardPort,
      watch,
      https,
      configFile,
    });

    console.log("Starting Codegen Reactor...");
    await spawnLocalReactor(
      {
        generate,
        port: reactorPort,
        watch,
        https,
        disableDefaultDrive,
        configFile,
        processors: ["ph/codegen/processor"],
      },
      driveUrl, // Pass the vetra drive URL as remote drive
    );

    // Start Connect pointing directly to the Vetra Drive
    console.log("Starting Connect...");
    console.log(`   ➜ Connect will use vetra drive: ${driveUrl}`);
    await spawnConnect({ configFile }, driveUrl);
  } catch (error) {
    console.error(error);
  }
}
