import type { VetraProcessorConfigType } from "@powerhousedao/config";
import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import type { IReactorClient } from "@powerhousedao/reactor";
import {
  getConfig,
  type PHConnectDefaultDrive,
  type PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import { addDefaultDrive } from "@powerhousedao/switchboard/utils";
import { join } from "node:path";
import { blue, green, red, yellow, type Color } from "colorette";
import type { ILogger } from "document-model";
import { childLogger, setLogLevel } from "document-model";
import { createLogger } from "vite";
import type { VetraArgs } from "../types.js";
import { generateProjectDriveId, POWERHOUSE_CONFIG_FILE } from "../utils.js";
import { wasFlagExplicitlyPassed } from "../utils/cli-connect-override.js";
import {
  configureVetraGithubUrl,
  sleep,
} from "../utils/configure-vetra-github-url.js";
import { POWERHOUSE_DRIVE_ICON } from "../utils/drive-icons.js";
import { mergeDefaultDrives, rebaseDriveUrl } from "@powerhousedao/host-core";
import { parseDefaultDrivesUrl } from "../utils/parse-default-drives.js";
import { resolveSwitchboardPort } from "../utils/resolve-switchboard-port.js";
import {
  clearVetraRuntime,
  probeVetraRuntime,
  syncMcpPort,
  writeVetraRuntime,
  type VetraRuntimeRecord,
} from "../utils/vetra-runtime.js";
import { stopVetra } from "../utils/vetra-launch.js";
import { runConnectStudio } from "./connect-studio.js";
import { startSwitchboard } from "./switchboard.js";

const VETRA_DRIVE_NAME = "vetra";

const getDefaultVetraUrl = (port: number) =>
  `http://localhost:${port}/d/${generateProjectDriveId(VETRA_DRIVE_NAME)}`;

const getDriveId = (driveUrl: string | undefined): string =>
  driveUrl?.split("/").pop() ?? generateProjectDriveId(VETRA_DRIVE_NAME);

// rebaseDriveUrl moved to @powerhousedao/host-core (uniform-runners P1.4) —
// one implementation shared by this classic path and the generic compound.

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

/** Creates the Vetra Preview drive, or opens it, and opens it in `app` when given. */
export async function startVetraPreviewDrive(
  reactor: IReactorClient,
  port: number,
  verbose?: boolean,
  app?: string,
): Promise<string | null> {
  const previewDriveId = generateProjectDriveId("preview");

  const previewDrive = {
    id: previewDriveId,
    slug: previewDriveId,
    global: {
      name: "Vetra Preview",
      icon: POWERHOUSE_DRIVE_ICON,
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
    reactor,
    { ...previewDrive, preferredEditor: app },
    port,
  );

  if (app && driveUrl) {
    await openDriveIn(reactor, previewDriveId, app);
  }

  if (verbose && driveUrl) {
    console.log(blue(`Vetra Switchboard: Preview drive: ${driveUrl}`));
  }
  return driveUrl ?? null;
}

/** Sets the drive's app unless it already has it; a drive from an earlier run keeps its old one otherwise. */
async function openDriveIn(
  reactor: IReactorClient,
  driveId: string,
  app: string,
): Promise<void> {
  const drive = await reactor.read.get(driveId);
  if (drive.header.meta?.preferredEditor === app) {
    return;
  }
  const handle = await reactor.write.setPreferredEditor(driveId, app);
  await handle.readable;
}

// Studio's drives, read and written on the local Switchboard, so Studio and agents see one set
// of drives (not with a remote Vetra drive, or a project that sets multiReactor or reactorClient), and no cookie banner.
export function buildVetraStudioOverride(
  defaultDrives: PHConnectDefaultDrive[],
  options: {
    remoteDrive?: string;
    projectConnect?: PHConnectRuntimeConfig;
  } = {},
): PHConnectRuntimeConfig {
  const override: PHConnectRuntimeConfig = {
    drives: { defaultDrives, preserveStrategy: "preserve-all" },
  };
  // A first visit's cookie dialog covers the local Studio, agents' browsers included.
  if (options.projectConnect?.app?.cookieBanner === undefined) {
    override.app = { cookieBanner: false };
  }
  const instance = options.projectConnect?.instance;
  if (
    !options.remoteDrive &&
    instance?.multiReactor === undefined &&
    instance?.reactorClient === undefined
  ) {
    override.instance = {
      reactorClient: "remote",
    } as typeof override.instance;
  }
  return override;
}

// Opens in Workflow Studio; only seeded when the switchboard runs workflows.
// Exported for the switchboard bridge runner: a hosts project with
// reactor.workflows enabled seeds the SAME project-hashed drive this vetra
// path does, until drive provisioning becomes a plugin contribution.
export async function seedWorkflowsDrive(
  reactor: IReactorClient,
  port: number,
  verbose?: boolean,
): Promise<string | null> {
  const workflowsDrive = {
    id: generateProjectDriveId("workflows"),
    slug: "workflows",
    global: { name: "Workflows" },
    preferredEditor: "workflow-studio",
    local: {
      availableOffline: true,
      listeners: [],
      sharingType: "public" as const,
      triggers: [],
    },
  };

  const driveUrl = await addDefaultDrive(reactor, workflowsDrive, port);

  if (verbose && driveUrl) {
    console.log(blue(`Vetra Switchboard: Workflows drive: ${driveUrl}`));
  }
  return driveUrl ?? null;
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
          getConfig(join(process.cwd(), POWERHOUSE_CONFIG_FILE)).vetra
            ?.previewDrive?.app,
        );
      } catch (error) {
        console.error(error);
      }
    }

    let workflowsDriveUrl: string | null = null;
    if (switchboard.workflowsEnabled) {
      try {
        workflowsDriveUrl = await seedWorkflowsDrive(
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
      if (workflowsDriveUrl) {
        console.log(blue(`   ➜ Workflows Drive URL: ${workflowsDriveUrl}`));
      }
    }
    return {
      driveUrl: switchboard.defaultDriveUrl || "",
      previewDriveUrl: previewDriveUrl,
      workflowsDriveUrl,
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
  let probe = await probeVetraRuntime(projectDir, projectName);

  if (
    args.restart &&
    (probe.status === "live" || probe.status === "starting")
  ) {
    console.log(`Stopping this project's Vetra (pid ${probe.record.pid})...`);
    await stopVetra({ projectDir, projectName });
    probe = await probeVetraRuntime(projectDir, projectName);
  }

  if (probe.status === "live" || probe.status === "starting") {
    console.log();
    console.log(
      green(
        probe.status === "live"
          ? "Vetra is already running for this project."
          : "Vetra is already starting for this project.",
      ),
    );
    const { record } = probe;
    console.log(
      green(
        `   ➜ Connect:     ${record.connectUrl ?? `http://localhost:${record.connectPort}`}`,
      ),
    );
    console.log(
      green(
        `   ➜ Switchboard: ${record.switchboardUrl ?? `http://localhost:${record.switchboardPort}/graphql`}`,
      ),
    );
    console.log(
      `Run \`ph vetra --restart\` to restart it, or stop it (pid ${probe.record.pid}).`,
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
    const workflowsDriveUrl = switchboardResult.workflowsDriveUrl;
    const actualSwitchboardPort = switchboardResult.switchboardPort;

    // Record what we actually bound, so a second `ph vetra` can tell a live
    // instance from a stale file, and so an agent can see the real ports.
    const runtimeRecord: VetraRuntimeRecord = {
      pid: process.pid,
      projectName,
      switchboardPort: actualSwitchboardPort,
      connectPort,
      switchboardUrl: `http://localhost:${actualSwitchboardPort}/graphql`,
      mcpUrl: `http://localhost:${actualSwitchboardPort}/mcp`,
      ...(disableConnect
        ? {}
        : { connectUrl: `http://localhost:${connectPort}/` }),
      startedAt: new Date().toISOString(),
    };
    writeVetraRuntime(projectDir, runtimeRecord);
    // A restarted Vetra may already have written its own.
    const releaseRuntimeRecord = () =>
      clearVetraRuntime(projectDir, process.pid);
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
      const browserWorkflowsDriveUrl =
        workflowsDriveUrl && publicBase
          ? rebaseDriveUrl(workflowsDriveUrl, publicBase)
          : workflowsDriveUrl;

      // The resolved default-drive list: vetra's own drives first (the
      // Vetra drive, the preview drive in watch mode, and the Workflows
      // drive when workflows are on), then the
      // project's configured `connect.drives.defaultDrives` from
      // powerhouse.config.json (issue #3023). A drive vetra also starts is
      // listed only once. An explicit `--default-drives-url` is appended on
      // top of this list by buildStudioConnectOverride — it never replaces
      // the vetra drives.
      const vetraDriveEntries = [
        ...(browserDriveUrl
          ? [{ url: browserDriveUrl, name: null, icon: null }]
          : []),
        ...(browserPreviewDriveUrl
          ? [{ url: browserPreviewDriveUrl, name: null, icon: null }]
          : []),
        ...(browserWorkflowsDriveUrl
          ? [{ url: browserWorkflowsDriveUrl, name: null, icon: null }]
          : []),
      ];
      // Read again each time Studio restarts for a changed powerhouse.config.json.
      const studioDrives = () => {
        const projectConnect = getConfig(
          join(projectDir, POWERHOUSE_CONFIG_FILE),
        ).connect;
        const drives = mergeDefaultDrives(
          vetraDriveEntries,
          projectConnect?.drives?.defaultDrives ?? [],
        );
        return { projectConnect, drives };
      };
      const resolvedDefaultDrives = studioDrives().drives;

      if (verbose) {
        console.log("Starting Connect...");
        // Mirror buildStudioConnectOverride: an explicit
        // --default-drives-url is appended to the resolved list.
        const flagDefaultDrives = wasFlagExplicitlyPassed("default-drives-url")
          ? parseDefaultDrivesUrl(args.defaultDrivesUrl ?? "")
          : [];
        const printedDefaultDrives = mergeDefaultDrives(
          resolvedDefaultDrives,
          flagDefaultDrives,
        );
        console.log(
          `   ➜ Connect will use default drives: ${printedDefaultDrives
            .map((d) => ("url" in d ? d.url : `local:${d.id}`))
            .join(", ")}`,
        );
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
      const vetraDrivesOverride = () => {
        const { projectConnect, drives } = studioDrives();
        return buildVetraStudioOverride(drives, {
          remoteDrive,
          projectConnect,
        });
      };

      const studio = await runConnectStudio(
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
        { reloadOnConfigChange: true },
      );
      // Vite may have taken another port, and the base path is Connect's.
      const connectUrl = studio.resolvedUrls?.local[0];
      if (connectUrl && connectUrl !== runtimeRecord.connectUrl) {
        writeVetraRuntime(projectDir, {
          ...runtimeRecord,
          connectPort: Number(new URL(connectUrl).port) || connectPort,
          connectUrl,
        });
      }
    }
  } catch (error) {
    console.error(error);
  }
}
