import type { VetraProcessorConfigType } from "@powerhousedao/config";
import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import type { ILogger, IReactorClient } from "@powerhousedao/reactor";
import { addDefaultDrive } from "@powerhousedao/switchboard/utils";
import { blue, green, red, yellow, type Color } from "colorette";
import {
  childLogger,
  setLogLevel,
  type IDocumentDriveServer,
} from "document-drive";
import { createLogger } from "vite";
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

function createViteLogger(color: Color) {
  const customLogger = createLogger("info");
  const loggerInfo = customLogger.info.bind(customLogger);
  customLogger.info = (msg, options) => {
    loggerInfo(color(msg), options);
  };
  const loggerWarn = customLogger.warn.bind(customLogger);
  customLogger.warn = (msg, options) => {
    loggerWarn(yellow(msg), options);
  };
  const loggerError = customLogger.error.bind(customLogger);
  customLogger.error = (msg, options) => {
    loggerError(red(msg), options);
  };

  const loggerWarnOnce = customLogger.warnOnce.bind(customLogger);
  customLogger.warnOnce = (msg, options) => {
    loggerWarnOnce(yellow(msg), options);
  };
  return customLogger;
}

async function startVetraPreviewDrive(
  reactor: IReactorClient,
  reactorLegacy: IDocumentDriveServer,
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
      nodes: [],
    },
    local: {
      availableOffline: true,
      listeners: [],
      sharingType: "public" as const,
      triggers: [],
    },
  };

  const driveUrl = await addDefaultDrive(
    reactorLegacy,
    reactor,
    previewDrive,
    port,
  );

  if (verbose) {
    console.log(blue(`Vetra Switchboard: Preview drive: ${driveUrl}`));
  }
  return driveUrl;
}
async function startLocalVetraSwitchboard(args: VetraArgs, logger?: ILogger) {
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
    const switchboard = await startSwitchboard(
      {
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
      },
      logger,
    );

    // Add preview drive (only in watch mode)
    let previewDriveUrl: string | null = null;
    if (watch) {
      try {
        previewDriveUrl = await startVetraPreviewDrive(
          switchboard.reactor,
          switchboard.legacyReactor,
          switchboardPort,
          verbose,
        );
      } catch (error) {
        console.error(error);
      }
    }

    if (verbose) {
      console.log(blue(`Vetra Switchboard: Started successfully`));
      if (remoteDrive) {
        console.log(
          blue(`Vetra Switchboard: Syncing with remote drive: ${remoteDrive}`),
        );
      }
    } else {
      console.log();
      console.log(
        blue(`Vetra Switchboard: http://localhost:${switchboardPort}/graphql`),
      );
      console.log(blue(`   ➜ Drive URL: ${switchboard.defaultDriveUrl}`));
      if (previewDriveUrl) {
        console.log(blue(`   ➜ Preview Drive URL: ${previewDriveUrl}`));
      }
    }
    return {
      driveUrl: switchboard.defaultDriveUrl || "",
      previewDriveUrl: previewDriveUrl,
    };
  } catch (error) {
    console.error(
      red(
        `Vetra Switchboard: ${error instanceof Error ? error.message : String(error)}`,
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
    host,
    open,
    cors,
    strictPort,
    printUrls,
    bindCLIShortcuts,
    watchTimeout,
  } = args;

  const switchboardLogger = childLogger(["vetra", "switchboard"]);

  try {
    // Set default log level to info if not already specified
    if (!process.env.LOG_LEVEL) {
      setLogLevel("info");
    }

    if (verbose) {
      switchboardLogger.info("Starting Vetra Switchboard...");
      if (remoteDrive) {
        const source = remoteDrive
          ? "command line argument"
          : "powerhouse.config.json";
        switchboardLogger.info(`Using vetraUrl from ${source}: ${remoteDrive}`);
      }
    }
    const switchboardResult = await startLocalVetraSwitchboard(
      {
        ...args,
        dev: true, // Vetra always runs in dev mode to load local packages
        httpsKeyFile,
        httpsCertFile,
        disableLocalPackages,
        debug,
      },
      switchboardLogger,
    );
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
      console.log();
      console.log(green(`Vetra Connect: http://localhost:${connectPort}`));

      const customViteLogger = createViteLogger(green);

      await runConnectStudio(
        {
          ...args,
          defaultDrivesUrl: previewDriveUrl
            ? [driveUrl, previewDriveUrl].join(",")
            : driveUrl,
          drivesPreserveStrategy: "preserve-all",
          port: connectPort,
          disableLocalPackages,
          debug,
          host: host,
          open: open,
          cors: cors,
          strictPort: strictPort,
          printUrls: printUrls,
          bindCLIShortcuts: bindCLIShortcuts,
          watchTimeout: watchTimeout,
        },
        customViteLogger,
      );
    }
  } catch (error) {
    console.error(error);
  }
}
