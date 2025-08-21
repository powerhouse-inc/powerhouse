import { type ConnectStudioOptions } from "@powerhousedao/builder-tools/connect-studio";
import { getConfig } from "@powerhousedao/config/utils";
import { blue, green, red } from "colorette";
import { setLogLevel } from "document-drive/utils/logger";
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
  connectPort?: number;
  configFile?: string;
  httpsKeyFile?: string;
  httpsCertFile?: string;
  verbose?: boolean;
  remoteDrive?: string;
  disableConnect?: boolean;
  interactive?: boolean;
};

async function startLocalVetraSwitchboard(
  options?: ReactorOptions & { verbose?: boolean },
  remoteDrive?: string,
) {
  const baseConfig = getConfig(options?.configFile);
  const { https } = baseConfig.reactor ?? { https: false };

  try {
    const {
      port: rawPort,
      configFile,
      verbose = false,
      dev,
      dbPath,
      packages,
    } = options || {};

    const port =
      typeof rawPort === "string"
        ? parseInt(rawPort)
        : typeof rawPort === "number"
          ? rawPort
          : 4001;

    // Convert single remote drive to array if provided
    const remoteDrives = remoteDrive ? [remoteDrive] : undefined;

    // Use the same switchboard service as the standalone command
    const Switchboard = await import("./switchboard.js");
    const { startSwitchboard } = Switchboard;

    const switchboard = await startSwitchboard({
      port,
      configFile: configFile || undefined,
      dev,
      dbPath,
      packages,
      remoteDrives,
      useVetraDrive: true, // Use Vetra drive instead of Powerhouse drive
      https,
      mcp: true,
    });

    if (verbose) {
      console.log(blue(`[Vetra Switchboard]: Started successfully`));
      if (remoteDrive) {
        console.log(
          blue(
            `[Vetra Switchboard]: Syncing with remote drive: ${remoteDrive}`,
          ),
        );
      }
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
  switchboardPort,
  connectPort,
  configFile,
  verbose = false,
  remoteDrive,
  disableConnect = false,
  interactive = false,
}: DevOptions) {
  try {
    // Set default log level to info if not already specified
    if (!process.env.LOG_LEVEL) {
      setLogLevel("info");
    }

    // Set environment variable for interactive code generation
    if (interactive) {
      process.env.CODEGEN_INTERACTIVE = "true";
      if (verbose) {
        console.log(
          "Interactive code generation enabled (CODEGEN_INTERACTIVE=true)",
        );
      }
    }

    const baseConfig = getConfig(configFile);

    // Use config port if no CLI port provided, fallback to default
    const resolvedSwitchboardPort =
      switchboardPort ?? baseConfig.reactor?.port ?? DefaultReactorOptions.port;
    const https = baseConfig.reactor?.https;

    // Use vetraUrl from config if no explicit remoteDrive is provided
    const configVetraUrl = baseConfig.vetraUrl;
    const resolvedVetraUrl = remoteDrive ?? configVetraUrl;

    if (verbose) {
      console.log("Starting Vetra Switchboard...");
      if (resolvedVetraUrl) {
        const source = remoteDrive
          ? "command line argument"
          : "powerhouse.config.json";
        console.log(`Using vetraUrl from ${source}: ${resolvedVetraUrl}`);
      }
    }
    const switchboardResult = await startLocalVetraSwitchboard(
      {
        generate,
        port: resolvedSwitchboardPort,
        watch,
        https,
        configFile,
        verbose,
      },
      resolvedVetraUrl,
    );
    const driveUrl: string = resolvedVetraUrl ?? switchboardResult.driveUrl;

    if (verbose) {
      console.log("Starting Codegen Reactor...");
    }

    // Start Connect pointing to the drive (unless disabled)
    if (!disableConnect) {
      if (verbose) {
        console.log("Starting Connect...");
        console.log(`   ➜ Connect will use drive: ${driveUrl}`);
      }
      await spawnConnect(
        { configFile, verbose, connectPort, enableDocumentsHMR: true },
        driveUrl,
      );
    }
  } catch (error) {
    console.error(error);
  }
}
