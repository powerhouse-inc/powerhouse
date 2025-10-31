import type { VetraProcessorConfigType } from "@powerhousedao/config";
import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import { getConfig } from "@powerhousedao/config/node";
import { blue, red } from "colorette";
import type { IDocumentDriveServer } from "document-drive";
import { setLogLevel } from "document-drive";
import { generateProjectDriveId } from "../utils.js";
import {
  configureVetraGithubUrl,
  sleep,
} from "../utils/configure-vetra-github-url.js";
import { startConnectStudio } from "./connect.js";
import type { ReactorOptions } from "./reactor.js";
import { DefaultReactorOptions } from "./reactor.js";

const VETRA_DRIVE_NAME = "vetra";

const getDefaultVetraUrl = (port: number) =>
  `http://localhost:${port}/d/${generateProjectDriveId(VETRA_DRIVE_NAME)}`;

export type DevOptions = {
  generate?: boolean;
  switchboardPort?: number;
  connectPort?: number;
  configFile?: string;
  httpsKeyFile?: string;
  httpsCertFile?: string;
  verbose?: boolean;
  remoteDrive?: string;
  disableConnect?: boolean;
  interactive?: boolean;
  watch?: boolean;
};

const getDriveId = (driveUrl: string | undefined): string =>
  driveUrl?.split("/").pop() ?? generateProjectDriveId(VETRA_DRIVE_NAME);

async function startVetraPreviewDrive(
  reactor: IDocumentDriveServer,
  port: number,
  verbose?: boolean,
): Promise<string> {
  const previewDriveId = generateProjectDriveId("preview");

  const previewDrive = {
    id: previewDriveId,
    slug: previewDriveId,
    global: {
      name: "Vetra Preview",
      icon: "https://azure-elderly-tortoise-212.mypinata.cloud/ipfs/bafkreifddkbopiyvcirf7vaqar74th424r5phlxkdxniirdyg3qgu2ajha",
    },
    local: {
      availableOffline: true,
      listeners: [],
      sharingType: "public" as const,
      triggers: [],
    },
  };

  try {
    await reactor.addDrive(previewDrive);
    if (verbose) {
      console.log(
        blue(`[Vetra Switchboard]: Preview drive created: ${previewDriveId}`),
      );
    }
  } catch {
    // Drive might already exist, which is fine
    if (verbose) {
      console.log(
        blue(
          `[Vetra Switchboard]: Preview drive already exists: ${previewDriveId}`,
        ),
      );
    }
  }

  return `http://localhost:${port}/d/${previewDriveId}`;
}

async function startLocalVetraSwitchboard(
  options?: ReactorOptions & {
    verbose?: boolean;
    interactiveCodegen?: boolean;
    watch?: boolean;
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

    const vetraDriveId = generateProjectDriveId(VETRA_DRIVE_NAME);

    const switchboard = await startSwitchboard({
      port,
      configFile: configFile || undefined,
      dev,
      dbPath,
      packages,
      remoteDrives,
      useVetraDrive: true, // Use Vetra drive instead of Powerhouse drive
      vetraDriveId,
      https,
      mcp: true,
      processorConfig,
      disableLocalPackages: !options?.watch,
    });

    // Add preview drive (only in watch mode)
    let previewDriveUrl: string | null = null;
    if (options?.watch) {
      previewDriveUrl = await startVetraPreviewDrive(
        switchboard.reactor,
        port,
        verbose,
      );
    }

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
    return {
      driveUrl: switchboard.defaultDriveUrl || "",
      previewDriveUrl: previewDriveUrl,
    };
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
  switchboardPort,
  connectPort,
  configFile,
  verbose = false,
  remoteDrive,
  disableConnect = false,
  interactive = false,
  watch = false,
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
        dev: true, // Vetra always runs in dev mode to load local packages
        https,
        configFile,
        verbose,
        interactiveCodegen: interactive,
        watch,
      },
      resolvedVetraUrl,
    );
    const driveUrl: string =
      switchboardResult.driveUrl || resolvedVetraUrl || "";
    const previewDriveUrl = switchboardResult.previewDriveUrl;

    // Configure GitHub URL if remote drive is set
    if (resolvedVetraUrl) {
      // give some time for the drive to process initial strands
      await sleep(3000);

      await configureVetraGithubUrl(
        resolvedSwitchboardPort,
        resolvedVetraUrl,
        verbose,
      );

      // give some time for the user to read log messages
      await sleep(2000);
    }

    if (verbose) {
      console.log("Starting Codegen Reactor...");
    }

    // Start Connect pointing to the drive (unless disabled)
    if (!disableConnect) {
      if (verbose) {
        console.log("Starting Connect...");
        const drives = previewDriveUrl
          ? `${driveUrl}, ${previewDriveUrl}`
          : driveUrl;
        console.log(`   ➜ Connect will use drives: ${drives}`);
      }
      await startConnectStudio({
        defaultDrivesUrl: previewDriveUrl
          ? [driveUrl, previewDriveUrl]
          : [driveUrl],
        drivesPreserveStrategy: "preserve-all",
        disableLocalPackage: !watch,
        devServerOptions: {
          port: connectPort,
        },
      });
    }
  } catch (error) {
    console.error(error);
  }
}
