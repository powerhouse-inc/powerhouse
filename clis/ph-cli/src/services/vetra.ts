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
import {
  clearVetraRuntime,
  probeVetraRuntime,
  syncMcpPort,
  writeVetraRuntime,
} from "../utils/vetra-runtime.js";
import { runConnectStudio } from "./connect-studio.js";
import { startSwitchboard } from "./switchboard.js";

const VETRA_DRIVE_NAME = "vetra";

const getDefaultVetraUrl = (port: number) =>
  `http://localhost:${port}/d/${generateProjectDriveId(VETRA_DRIVE_NAME)}`;

const getDriveId = (driveUrl: string | undefined): string =>
  driveUrl?.split("/").pop() ?? generateProjectDriveId(VETRA_DRIVE_NAME);

// Rebase a local drive URL onto --drives-public-base: keeps the /d/<slug>
// path, swaps the loopback origin for the public base. Browser clients
// behind a reverse proxy can't reach http://localhost:<port>. Non-loopback
// URLs (e.g. a remote drive) are already public and pass through unchanged.
const rebaseDriveUrl = (driveUrl: string, publicBase: string): string => {
  // Unparseable URLs pass through unchanged, like non-loopback ones.
  let url: URL;
  try {
    url = new URL(driveUrl);
  } catch {
    return driveUrl;
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return driveUrl;
  }
  return `${publicBase.replace(/\/+$/, "")}${url.pathname}`;
};

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

  // One Vetra per project. Two instances over one working tree would contend
  // for the same `.ph/read-model.db` and `.ph/reactor-storage`, and leave the
  // project with two drives that diverge.
  const projectDir = process.cwd();
  const { readPackageSync } = await import("read-pkg");
  const projectName = readPackageSync({ cwd: projectDir }).name;
  const probe = await probeVetraRuntime(projectDir, projectName);

  if (probe.status === "live") {
    console.log();
    console.log(green("Vetra is already running for this project."));
    console.log(
      green(`   ➜ Connect:     http://localhost:${probe.record.connectPort}`),
    );
    console.log(
      green(
        `   ➜ Switchboard: http://localhost:${probe.record.switchboardPort}/graphql`,
      ),
    );
    console.log(
      `Stop that instance (pid ${probe.record.pid}) if you need to restart it.`,
    );
    return;
  }

  if (probe.status === "foreign") {
    console.error(
      red(
        `.ph/vetra-runtime.json describes a live Vetra for "${probe.record.projectName}", ` +
          `but this project is "${projectName}". Refusing to start a second instance. ` +
          `Delete .ph/vetra-runtime.json if that record is wrong.`,
      ),
    );
    process.exit(1);
  }

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

    // Record what we actually bound, so a second `ph vetra` can tell a live
    // instance from a stale file, and so an agent can see the real ports.
    writeVetraRuntime(projectDir, {
      pid: process.pid,
      projectName,
      switchboardPort: actualSwitchboardPort,
      connectPort,
      mcpUrl: `http://localhost:${actualSwitchboardPort}/mcp`,
      startedAt: new Date().toISOString(),
    });
    const releaseRuntimeRecord = () => clearVetraRuntime(projectDir);
    process.on("exit", releaseRuntimeRecord);
    process.on("SIGINT", () => {
      releaseRuntimeRecord();
      process.exit(130);
    });
    process.on("SIGTERM", () => {
      releaseRuntimeRecord();
      process.exit(143);
    });

    // An MCP client resolved `.mcp.json` before this process started and
    // cannot re-read it, so a drifted literal means the agent is pointed at
    // the wrong port — possibly another project's reactor. Correct the file
    // and say so plainly; we cannot fix the already-open client ourselves.
    const driftedMcpFiles = syncMcpPort(projectDir, actualSwitchboardPort);
    if (driftedMcpFiles.length > 0) {
      console.log(
        yellow(
          `Updated ${driftedMcpFiles.join(" and ")} to port ${actualSwitchboardPort}. ` +
            `Reconnect your MCP client (/mcp) to pick it up. ` +
            `This edit is local — do not commit it.`,
        ),
      );
    }

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
      // --drives-public-base: advertise proxy-reachable drive URLs to the
      // browser instead of the switchboard's localhost origin.
      const publicBase = args.drivesPublicBase;
      const browserDriveUrl = publicBase
        ? rebaseDriveUrl(driveUrl, publicBase)
        : driveUrl;
      const browserPreviewDriveUrl =
        previewDriveUrl && publicBase
          ? rebaseDriveUrl(previewDriveUrl, publicBase)
          : previewDriveUrl;
      const vetraDrivesOverride = {
        drives: {
          defaultDrives: parseDefaultDrivesUrl(
            browserPreviewDriveUrl
              ? [browserDriveUrl, browserPreviewDriveUrl].join(",")
              : browserDriveUrl,
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
