/**
 * CLI Runtime — manages the lifecycle of reactor, switchboard, agent, and routine.
 *
 * Extracted from the runImpl() closure in cli.ts so that each operation
 * (startup, teardown, lazy reactor/agent creation) is independently testable
 * with injectable dependencies.
 */

import type {
  AgentSetupContext,
  AgentLoader,
  AgentProvider,
  Command,
  CommandContext,
  Logger,
  PromptsConfig,
  Routine,
  WorkdirStore,
  WrapRegistry,
} from "./types.js";
import { IDENTITY_WRAPS } from "./wraps.js";
import type { SkillInfo } from "./skills.js";
import type {
  ReactorConfiguration,
  ReactorContext,
  SwitchboardInstance,
  IAttachmentService,
} from "../integrations/powerhouse/types.js";
import type { ProxyServerInstance } from "./proxy.js";
import { resolvePort } from "../integrations/powerhouse/ports.js";
import {
  buildSwitchboardRoutes,
  buildSwitchboardProxyUrls,
  deriveBasePath,
} from "./proxy-routes.js";
import { createRemoteAttachmentService } from "@powerhousedao/reactor-attachments";

/**
 * Dependencies for a CLI runtime instance.
 */
export interface CliRuntimeDeps {
  cliName: string;
  cliVersion: string;
  workdir: string;
  workspace: WorkdirStore;
  config: Record<string, unknown>;
  context: CommandContext;
  log: Logger;
  commandMap: Map<string, Command>;

  reactorConfig?: ReactorConfiguration;
  /**
   * Switchboard-provided attachment service. Constructed externally
   * (switchboard owns createRemoteAttachmentService) and relayed into
   * ReactorSetupContext so the create() factory can place it on ReactorContext.
   */
  attachments?: IAttachmentService;
  /**
   * Mints the bearer token for the embedded switchboard's HTTP attachment
   * routes. Passed to the default `createRemoteAttachmentService` below so
   * reservation/upload calls authenticate against an auth-enabled switchboard.
   * Supplied by the host CLI (the framework has no identity of its own).
   */
  attachmentJwtHandler?: (url: string) => Promise<string | undefined>;
  agentLoader?: AgentLoader;
  /** The routine object. Used for capability wiring and teardown. */
  routine?: Routine;
  /** When true, the routine is not started in startupSequence (--no-routine). */
  skipRoutineStart?: boolean;
  proxyInstance?: ProxyServerInstance;

  /** When false, switchboard startup is skipped (--no-api). Default: true. */
  enableSwitchboard?: boolean;
  /** When false, connect startup is skipped (--no-studio). Default: true. */
  enableConnect?: boolean;

  skillIds: Set<string>;
  resolvedSkills: SkillInfo[];
  prompts?: PromptsConfig;

  /** Composed wrap registry from lifecycle hooks. Defaults to IDENTITY_WRAPS. */
  wraps?: WrapRegistry;
  /** Reverse-order shutdown for lifecycle hooks. Called from teardown(). */
  lifecycleShutdown?: () => Promise<void>;
}

/**
 * CLI runtime: manages the lifecycle of reactor, switchboard, agent, and routine.
 */
export interface CliRuntime {
  getReactor(): Promise<ReactorContext | undefined>;
  getAgent(): Promise<AgentProvider | undefined>;
  startupSequence(output: (msg: string) => void): Promise<void>;
  teardown(): Promise<void>;
  reportActiveServices(output: (msg: string) => void): void;
}

export function createCliRuntime(deps: CliRuntimeDeps): CliRuntime {
  const {
    cliName,
    cliVersion,
    workdir,
    workspace,
    config,
    context,
    log,
    commandMap,
    reactorConfig,
    agentLoader,
    routine,
    proxyInstance,
    skillIds,
    resolvedSkills,
    prompts,
  } = deps;
  const enableSwitchboard = deps.enableSwitchboard ?? true;
  const enableConnect = deps.enableConnect ?? true;
  const skipRoutineStart = deps.skipRoutineStart ?? false;
  const wraps = deps.wraps ?? IDENTITY_WRAPS;
  const lifecycleShutdown = deps.lifecycleShutdown;

  let cachedReactor: ReactorContext | undefined;
  let switchboardInstance: SwitchboardInstance | undefined;
  let cachedProvider: AgentProvider | undefined;

  async function getReactor(): Promise<ReactorContext | undefined> {
    if (cachedReactor) return cachedReactor;
    if (!reactorConfig) return undefined;
    cachedReactor = await reactorConfig.create({
      workdir,
      config,
      workspace,
      emit: context.emit,
      on: context.on,
      switchboard: reactorConfig.switchboard,
      attachments: deps.attachments,
    });
    return cachedReactor;
  }

  async function getAgent(): Promise<AgentProvider | undefined> {
    if (cachedProvider) return cachedProvider;
    if (!agentLoader) return undefined;
    // Reactor is initialized first — agent may need reactor tools
    await getReactor();
    const agentCtx: AgentSetupContext = {
      workdir,
      config,
      cliName,
      cliVersion,
      context,
      commands: [...commandMap.values()].filter((c) => !skillIds.has(c.id)),
      skills: resolvedSkills,
      prompts,
      wraps,
    };
    cachedProvider = await agentLoader(agentCtx);
    return cachedProvider;
  }

  async function startSwitchboardLayer(): Promise<void> {
    if (!reactorConfig?.switchboard?.enabled || !cachedReactor?._module) return;
    const switchboardHost = reactorConfig.switchboard.host ?? "localhost";
    const switchboardLabel = reactorConfig.switchboard.name ?? "switchboard";
    const switchboardPort = await resolvePort(
      reactorConfig.switchboard.port!,
      reactorConfig.switchboard.portRange ?? 1,
      switchboardLabel,
    );

    const dbPath = workspace.getStoreFolder("read-model.db");
    log.debug(
      `Starting Switchboard on ${switchboardHost}:${switchboardPort}, dbPath: ${dbPath}`,
    );

    const { startSwitchboard } =
      await import("../integrations/powerhouse/switchboard.js");
    switchboardInstance = await startSwitchboard({
      reactorModule: cachedReactor._module,
      host: switchboardHost,
      port: switchboardPort,
      dbPath,
      driveId: cachedReactor.driveId,
      registryUrl: reactorConfig.switchboard.registryUrl,
    });

    // Propagate URLs to the reactor context
    cachedReactor.switchboardUrl = switchboardInstance.switchboardUrl;
    cachedReactor.driveUrl = switchboardInstance.driveUrl;
    cachedReactor.mcpUrl = switchboardInstance.mcpUrl;

    // Resolve attachment:// refs through the local switchboard. The
    // /attachments/* routes mount at the host root, so use the origin.
    // The jwtHandler authenticates reservation/upload calls when the
    // switchboard has auth enabled (otherwise they 401). Skip if a service
    // was injected externally.
    if (!cachedReactor.attachments) {
      cachedReactor.attachments = createRemoteAttachmentService({
        remoteUrl: new URL(switchboardInstance.switchboardUrl).origin,
        jwtHandler: deps.attachmentJwtHandler,
      });
    }

    // Route through the proxy before announcing readiness, so consumers of
    // the event can hand out the proxied URLs immediately.
    if (proxyInstance) {
      const sbRoutes = buildSwitchboardRoutes(
        switchboardInstance.switchboardUrl,
        switchboardInstance.mcpUrl,
      );
      for (const route of sbRoutes) {
        proxyInstance.addRoute(route);
        log.debug(
          `  proxy: ${route.prefix} → ${route.upstream?.toString() ?? route.redirectTo ?? ""}`,
        );
      }
    }

    context.emit?.("powerhouse:switchboard:ready", {
      switchboardUrl: switchboardInstance.switchboardUrl,
      driveUrl: switchboardInstance.driveUrl,
      mcpUrl: switchboardInstance.mcpUrl,
      // Browser-facing equivalents through the embedded proxy, when enabled.
      proxy: proxyInstance
        ? {
            url: proxyInstance.url,
            ...buildSwitchboardProxyUrls(
              proxyInstance.url,
              switchboardInstance,
            ),
          }
        : undefined,
    });
  }

  async function teardown(): Promise<void> {
    if (routine && routine.status === "running") {
      log.debug("Stopping routine...");
      await routine.stop();
    }
    if (switchboardInstance) {
      log.debug("Stopping Switchboard...");
      await switchboardInstance.shutdown();
    }
    if (proxyInstance) {
      log.debug("Stopping proxy...");
      await proxyInstance.stop();
    }
    if (cachedReactor) {
      log.debug("Stopping Reactor...");
      await cachedReactor.shutdown();
    }
    // Lifecycle hooks last — they may want to flush telemetry covering the
    // teardown of other subsystems. Their internal try/catch handles failures.
    if (lifecycleShutdown) {
      log.debug("Stopping lifecycle hooks...");
      await lifecycleShutdown();
    }
  }

  function reportActiveServices(output: (msg: string) => void): void {
    if (!context.services) return;
    const dim = "\x1b[2m";
    const reset = "\x1b[0m";
    const active = context.services
      .list()
      .filter((s) => s.status === "ready" || s.status === "starting");
    for (let i = 0; i < active.length; i++) {
      const svc = active[i];
      const where = svc.workdir ? ` ${dim}\`${svc.workdir}\`${reset}` : "";
      output(
        `${i === 0 ? "\n\n" : ""}${svc.name} still active${where}\n  ${dim}Run \`${cliName} ${svc.serviceId}-stop\` to shut it down${reset}`,
      );
    }
  }

  async function startupSequence(output: (msg: string) => void): Promise<void> {
    try {
      // 0. Proxy (if enabled, already listening)
      if (proxyInstance) {
        output(`Proxy listening on ${proxyInstance.url}`);
      }

      // 1. Reactor (in-process document store + drive + subscriptions)
      if (reactorConfig) {
        log.debug("Starting Reactor...");
        await getReactor();
        log.debug(
          `Reactor storage: ${workspace.getStoreFolder("reactor-storage")}`,
        );
        output(`Reactor ready (drive: ${cachedReactor!.driveId})`);

        // Inject folder operations when a personal drive is available
        if (cachedReactor!.personalDriveId) {
          const { createFolderOperations, createFolderCommands } =
            await import("../integrations/powerhouse/folders.js");
          const folderOps = createFolderOperations(
            cachedReactor!.client,
            cachedReactor!.personalDriveId,
            log,
          );
          context.folders = folderOps;
          const folderCmds = createFolderCommands(folderOps);
          for (const cmd of folderCmds) {
            commandMap.set(cmd.id, cmd);
          }
        }
      }

      // 2. Switchboard (GraphQL + MCP endpoint wrapping reactor)
      if (
        reactorConfig?.switchboard?.enabled &&
        enableSwitchboard &&
        cachedReactor?._module
      ) {
        log.debug("Starting Switchboard...");
        await startSwitchboardLayer();
        const sb = switchboardInstance!;
        output(
          `Switchboard '${reactorConfig.switchboard.name!}' ready at ${sb.switchboardUrl}`,
        );
        log.debug(`  drive: ${sb.driveUrl}`);
        log.debug(`  mcp:   ${sb.mcpUrl}`);
      }

      // 3. Connect (web UI child process)
      if (
        reactorConfig?.connect?.enabled &&
        enableConnect &&
        context.services
      ) {
        const connectName = reactorConfig.connect.name!; // Always stamped by resolveReactorDefaults
        const connectWorkdir = reactorConfig.connect.workdir ?? workdir;
        const instances = context.services.list(connectName);
        const running = instances.find(
          (i) => i.status === "ready" || i.status === "starting",
        );

        if (running && running.workdir === connectWorkdir) {
          const url = running.endpoints?.["connect-studio"] ?? "unknown URL";
          output(`Connect '${connectName}' already running at ${url}`);
        } else {
          // Stop instance running in wrong workdir
          if (running) {
            log.info(`Stopping Connect (wrong workdir: ${running.workdir})`);
            await context.services.stop(connectName);
          }
          log.debug(`Starting Connect in ${connectWorkdir}`);
          const connectParams: Record<string, unknown> = {};
          if (reactorConfig.connect!.port)
            connectParams.port = reactorConfig.connect!.port;
          if (cachedReactor?.driveUrl)
            connectParams.driveUrl = cachedReactor.driveUrl;
          // Deploy base for the dynamic-base Connect bundle: the proxy mount
          // derived from the resolved proxyPublicUrl ('/' at root). The mount
          // only — never X-Forwarded-Prefix, which is per-route.
          connectParams.base = `${deriveBasePath(config.proxyPublicUrl as string | undefined)}/`;
          const instanceId = await context.services.start(connectName, {
            workdir: connectWorkdir,
            cwd: connectWorkdir,
            params:
              Object.keys(connectParams).length > 0 ? connectParams : undefined,
          });
          // URL is captured from the service's readiness pattern
          const status = context.services
            .list(connectName)
            .find((i) => i.instanceId === instanceId);
          const connectUrl =
            status?.endpoints?.["connect-studio"] ??
            `http://localhost:${reactorConfig.connect!.port!}`;
          output(`Connect '${connectName}' ready at ${connectUrl}`);
        }

        // List all drives
        const drives = cachedReactor?.drives;
        const baseDriveUrl = cachedReactor?.driveUrl;
        const baseDriveId = cachedReactor?.driveId;
        if (drives?.length) {
          const driveLines = drives.map((d) => {
            const url =
              baseDriveUrl && baseDriveId
                ? baseDriveUrl.replace(baseDriveId, d.id)
                : `(drive: ${d.id})`;
            return `    ${d.name} (${d.role}): ${url}`;
          });
          output(`  Drives:\n${driveLines.join("\n")}`);
        }
      }

      // 4. Routine (tick-based trigger loop)
      if (routine && !skipRoutineStart) {
        routine.setContext(context);
        routine.start();
        output("Routine running");
      }
    } catch (err) {
      await teardown();
      throw err;
    }
  }

  // Wire capabilities immediately so triggers can access reactor/agent.
  // Wraps are passed alongside — IDENTITY_WRAPS by default when no lifecycle
  // hook is registered.
  if (routine) {
    routine.setCapabilities({ getReactor, getAgent, wraps });
  }

  return {
    getReactor,
    getAgent,
    startupSequence,
    teardown,
    reportActiveServices,
  };
}
