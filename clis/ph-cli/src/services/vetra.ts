import type { VetraProcessorConfigType } from "@powerhousedao/config";
import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import { blue, red } from "colorette";
import type { IDocumentDriveServer } from "document-drive";
import { setLogLevel } from "document-drive";
import type { VetraArgs } from "../types.js";
import { generateProjectDriveId } from "../utils.js";
import {
  configureVetraGithubUrl,
  sleep,
} from "../utils/configure-vetra-github-url.js";
import { runConnectStudio } from "./connect-studio.js";
import { startSwitchboard } from "./switchboard.js";

const VETRA_DRIVE_NAME = "vetra";

const getDefaultVetraUrl = (port: number) =>
  `http://localhost:${port}/d/${generateProjectDriveId(VETRA_DRIVE_NAME)}`;

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
async function startLocalVetraSwitchboard(args: VetraArgs) {
  const {
    connectPort,
    switchboardPort,
    dev,
    packages,
    disableLocalPackages,
    debug,
    httpsKeyFile,
    httpsCertFile,
    remoteDrive,
    interactive,
    watch,
    verbose,
  } = args;

  // Convert single remote drive to array if provided
  const remoteDrives = remoteDrive ? [remoteDrive] : [];

  const vetraProcessorConfig: VetraProcessorConfigType = {
    interactive,
    driveUrl: remoteDrive ?? getDefaultVetraUrl(connectPort),
    driveId: getDriveId(remoteDrive),
  };

  const processorConfig = new Map<string, unknown>();
  processorConfig.set(VETRA_PROCESSOR_CONFIG_KEY, vetraProcessorConfig);

  const vetraDriveId = generateProjectDriveId(VETRA_DRIVE_NAME);

  try {
    const switchboard = await startSwitchboard({
      ...args,
      useVetraDrive: true, // Use Vetra drive instead of Powerhouse drive
      mcp: true,
      port: switchboardPort,
      dev,
      packages,
      remoteDrives,
      vetraDriveId,
      disableLocalPackages,
      debug,
      httpsKeyFile,
      httpsCertFile,
      basePath: undefined,
      keypairPath: undefined,
      dbPath: undefined,
      useIdentity: undefined,
      migrate: undefined,
      migrateStatus: undefined,
      requireIdentity: undefined,
    });

    // Add preview drive (only in watch mode)
    let previewDriveUrl: string | null = null;
    if (watch) {
      previewDriveUrl = await startVetraPreviewDrive(
        switchboard.reactor,
        switchboardPort,
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

export async function startVetra(args: VetraArgs) {
  const {
    switchboardPort,
    connectPort,
    verbose,
    remoteDrive,
    disableConnect,
    debug,
    httpsCertFile,
    httpsKeyFile,
    disableLocalPackages,
  } = args;

  try {
    // Set default log level to info if not already specified
    if (!process.env.LOG_LEVEL) {
      setLogLevel("info");
    }

    if (verbose) {
      console.log("Starting Vetra Switchboard...");
      if (remoteDrive) {
        const source = remoteDrive
          ? "command line argument"
          : "powerhouse.config.json";
        console.log(`Using vetraUrl from ${source}: ${remoteDrive}`);
      }
    }
    const switchboardResult = await startLocalVetraSwitchboard({
      ...args,
      dev: true, // Vetra always runs in dev mode to load local packages
      httpsKeyFile,
      httpsCertFile,
      disableLocalPackages,
      debug,
    });
    const driveUrl: string = switchboardResult.driveUrl || remoteDrive || "";
    const previewDriveUrl = switchboardResult.previewDriveUrl;

    // Configure GitHub URL if remote drive is set
    if (remoteDrive) {
      // give some time for the drive to process initial strands
      await sleep(3000);

      await configureVetraGithubUrl(switchboardPort, remoteDrive, verbose);

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
      await runConnectStudio({
        ...args,
        defaultDrivesUrl: previewDriveUrl
          ? [driveUrl, previewDriveUrl].join(",")
          : driveUrl,
        drivesPreserveStrategy: "preserve-all",
        port: connectPort,
        disableLocalPackages,
        debug,
        host: false,
        open: false,
        cors: false,
        strictPort: false,
        printUrls: false,
        bindCLIShortcuts: false,
        watchTimeout: 300,
      });
    }
  } catch (error) {
    console.error(error);
  }
}
