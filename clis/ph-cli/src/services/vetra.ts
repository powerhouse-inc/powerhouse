import { type ConnectStudioOptions } from "@powerhousedao/builder-tools/connect-studio";
import { blue, cyan, green, red } from "colorette";
import { type ChildProcessWithoutNullStreams, fork } from "node:child_process";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../utils.js";
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

function spawnLocalVetraSwitchboard(options?: ReactorOptions) {
  const child = fork(
    path.join(dirname(__dirname), "commands", "vetra-switchboard.js"),
    ["spawn", JSON.stringify(options)],
    { silent: true },
  ) as ChildProcessWithoutNullStreams;

  return new Promise<{ driveUrl: string }>((resolve) => {
    child.on("message", (message) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const text = message.toString();

      if (text.startsWith("driveUrl:")) {
        const driveUrl = text.substring("driveUrl:".length);
        resolve({ driveUrl });
      }
    });

    child.stdout.on("data", (data: Buffer) => {
      const message = data.toString();
      const lines = message.split("\n").filter((line) => line.trim().length);
      for (const line of lines) {
        process.stdout.write(blue(`[Vetra Switchboard]: ${line}\n`));
      }
    });

    child.stderr.on("error", (data: Buffer) => {
      process.stderr.write(red(`[Vetra Switchboard]: ${data.toString()}`));
    });
    child.on("error", (err) => {
      process.stderr.write(red(`[Vetra Switchboard]: ${err}`));
    });

    child.on("exit", (code) => {
      console.log(`Vetra Switchboard process exited with code ${code}`);
    });
  });
}

function spawnLocalReactor(options?: ReactorOptions, switchboardUrl?: string) {
  const reactorOptions = {
    ...options,
    remoteDrives: switchboardUrl || "",
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
        // TODO add studio variables?
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
  disableDefaultDrive,
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
    });
    console.log(`Vetra Switchboard started at: ${driveUrl}`);

    // Start Local Reactor with Switchboard as remote drive
    console.log("Starting Local Reactor...");
    const { reactorUrl } = await spawnLocalReactor(
      {
        generate,
        port: reactorPort,
        watch,
        https,
        disableDefaultDrive,
      },
      driveUrl,
    );
    console.log(`Local Reactor started at: ${reactorUrl}`);

    // Start Connect pointing to the Local Reactor
    console.log("Starting Connect...");
    await spawnConnect({ configFile }, reactorUrl);
  } catch (error) {
    console.error(error);
  }
}
