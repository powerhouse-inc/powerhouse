import type { VetraProcessorConfigType } from "@powerhousedao/config";
import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import { getConfig } from "@powerhousedao/config/node";
import { blue, red } from "colorette";
import { setLogLevel } from "document-drive";
import { startConnect } from "./connect.js";
import type { ReactorOptions } from "./reactor.js";
import { DefaultReactorOptions } from "./reactor.js";

const VETRA_DRIVE_ID = "vetra";
const getDefaultVetraUrl = (port: number) =>
  `http://localhost:${port}/d/${VETRA_DRIVE_ID}`;

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
  watchPackages?: boolean;
};

const getDriveId = (driveUrl: string | undefined): string =>
  driveUrl?.split("/").pop() ?? VETRA_DRIVE_ID;

async function startLocalVetraSwitchboard(
  options?: ReactorOptions & {
    verbose?: boolean;
    interactiveCodegen?: boolean;
    watchPackages?: boolean;
  },
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

    const vetraProcessorConfig: VetraProcessorConfigType = {
      interactive: options?.interactiveCodegen,
      driveUrl: remoteDrive ?? getDefaultVetraUrl(port),
      driveId: getDriveId(remoteDrive),
    };

    const processorConfig = new Map<string, unknown>();
    processorConfig.set(VETRA_PROCESSOR_CONFIG_KEY, vetraProcessorConfig);

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
      processorConfig,
      disableLocalPackages: !options?.watchPackages,
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
  watchPackages = false,
}: DevOptions) {
  try {
    // Set default log level to info if not already specified
    if (!process.env.LOG_LEVEL) {
      setLogLevel("info");
    }

    const baseConfig = getConfig(configFile);

    // Use config port if no CLI port provided, fallback to default
    const resolvedSwitchboardPort =
      switchboardPort ?? baseConfig.reactor?.port ?? DefaultReactorOptions.port;
    const https = baseConfig.reactor?.https;

    // Use vetraUrl from config if no explicit remoteDrive is provided
    const configVetraUrl = baseConfig.vetra?.driveUrl;
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
        dev: true, // Vetra always runs in dev mode to load local packages
        https,
        configFile,
        verbose,
        interactiveCodegen: interactive,
        watchPackages,
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
      await startConnect({
        defaultDrivesUrl: [driveUrl],
        drivesPreserveStrategy: "preserve-all",
        disableLocalPackages: !watchPackages,
        port: connectPort,
      });
    }
  } catch (error) {
    console.error(error);
  }
}
