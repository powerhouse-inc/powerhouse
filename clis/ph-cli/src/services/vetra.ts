import type { VetraProcessorConfigType } from "@powerhousedao/config";
import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import type { IReactorClient } from "@powerhousedao/reactor";
import { addDefaultDrive } from "@powerhousedao/switchboard/utils";
import { blue, green, red, yellow, type Color } from "colorette";
import type { ILogger } from "document-model";
import { childLogger, setLogLevel } from "document-model";
import { createLogger } from "vite";
import type { VetraArgs } from "../types.js";
import { generateProjectDriveId } from "../utils.js";
import {
  configureVetraGithubUrl,
  sleep,
} from "../utils/configure-vetra-github-url.js";
import { parseDefaultDrivesUrl } from "../utils/parse-default-drives.js";
import { resolveSwitchboardPort } from "../utils/resolve-switchboard-port.js";
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

  const driveUrl = await addDefaultDrive(reactor, previewDrive, port);

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

  // When the user didn't opt into strict-port semantics, check for a port
  // conflict up front and ask for confirmation before binding a fallback.
  // Doing this in the CLI layer keeps the interactive prompt out of the
  // switchboard server package and aligns with the existing prerelease-tag
  // confirmation flow in `ph publish`.
  const resolvedSwitchboardPort = args.strictPort
    ? switchboardPort
    : await resolveSwitchboardPort(switchboardPort);

  try {
    const switchboard = await startSwitchboard(
      {
        ...args,
        useVetraDrive: true, // Use Vetra drive instead of Powerhouse drive
        mcp: true,
        port: resolvedSwitchboardPort,
        // We've already probed and (when interactive) confirmed the port with
        // the user, so keep the server from running its own fallback on top.
        strictPort: true,
        dev,
        packages,
        remoteDrives,
        vetraDriveId,
        disableLocalPackages,
        debug,
        httpsKeyFile,
        httpsCertFile,
        processorConfig,
        basePath: undefined,
        keypairPath: undefined,
        dbPath: args.dbPath,
        useIdentity: undefined,
        migrate: undefined,
        migrateStatus: undefined,
        reset: undefined,
        yes: undefined,
        requireIdentity: undefined,
      },
      logger,
    );

    const actualSwitchboardPort = switchboard.port;

    // Add preview drive (only in watch mode)
    let previewDriveUrl: string | null = null;
    if (watch) {
      try {
        previewDriveUrl = await startVetraPreviewDrive(
          switchboard.reactor,
          actualSwitchboardPort,
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
        blue(
          `Vetra Switchboard: http://localhost:${actualSwitchboardPort}/graphql`,
        ),
      );
      console.log(blue(`   ➜ Drive URL: ${switchboard.defaultDriveUrl}`));
      if (previewDriveUrl) {
        console.log(blue(`   ➜ Preview Drive URL: ${previewDriveUrl}`));
      }
    }
    return {
      driveUrl: switchboard.defaultDriveUrl || "",
      previewDriveUrl: previewDriveUrl,
      switchboardPort: actualSwitchboardPort,
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
    const actualSwitchboardPort = switchboardResult.switchboardPort;

    // Configure GitHub URL if remote drive is set
    if (remoteDrive) {
      // give some time for the drive to process initial strands
      await sleep(3000);

      await configureVetraGithubUrl(
        actualSwitchboardPort,
        remoteDrive,
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
      console.log();
      console.log(green(`Vetra Connect: http://localhost:${connectPort}`));

      const customViteLogger = createViteLogger(green);

      // Programmatic override forwarded to the Connect runtime config —
      // vetra always sets these regardless of what the user typed on the
      // command line. We pass it as the explicit third arg to
      // runConnectStudio so it survives the `wasFlagExplicitlyPassed`
      // gating (the user didn't pass --default-drives-url; vetra is setting
      // it itself).
      const vetraDrivesOverride = {
        drives: {
          defaultDrives: parseDefaultDrivesUrl(
            previewDriveUrl ? [driveUrl, previewDriveUrl].join(",") : driveUrl,
          ),
          preserveStrategy: "preserve-all" as const,
        },
      };

      await runConnectStudio(
        {
          ...args,
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
        vetraDrivesOverride,
      );
    }
  } catch (error) {
    console.error(error);
  }
}
