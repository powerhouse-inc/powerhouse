/**
 * CLI Runtime — manages the lifecycle of reactor, agent, and routine.
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
  IAttachmentService,
} from "../integrations/powerhouse/types.js";

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
   * Mints the bearer token for the switchboard's HTTP attachment routes.
   * Passed to the reactor factory (`ReactorSetupContext.attachmentJwtHandler`)
   * for a remote attach, so reservation/upload calls authenticate against an
   * auth-enabled switchboard. Supplied by the host CLI (the framework has no
   * identity of its own).
   */
  attachmentJwtHandler?: (url: string) => Promise<string | undefined>;
  agentLoader?: AgentLoader;
  /** The routine object. Used for capability wiring and teardown. */
  routine?: Routine;
  /** When true, the routine is not started in startupSequence (--no-routine). */
  skipRoutineStart?: boolean;

  skillIds: Set<string>;
  resolvedSkills: SkillInfo[];
  prompts?: PromptsConfig;

  /** Composed wrap registry from lifecycle hooks. Defaults to IDENTITY_WRAPS. */
  wraps?: WrapRegistry;
  /** Reverse-order shutdown for lifecycle hooks. Called from teardown(). */
  lifecycleShutdown?: () => Promise<void>;
}

/**
 * CLI runtime: manages the lifecycle of reactor, agent, and routine.
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
    skillIds,
    resolvedSkills,
    prompts,
  } = deps;
  const skipRoutineStart = deps.skipRoutineStart ?? false;
  const wraps = deps.wraps ?? IDENTITY_WRAPS;
  const lifecycleShutdown = deps.lifecycleShutdown;

  let cachedReactor: ReactorContext | undefined;
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
      attachments: deps.attachments,
      attachmentJwtHandler: deps.attachmentJwtHandler,
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

  async function teardown(): Promise<void> {
    if (routine && routine.status === "running") {
      log.debug("Stopping routine...");
      await routine.stop();
    }
    // Services are this process's children and end with it: stop them
    // gracefully before the reactor they may talk to.
    if (context.services) {
      log.debug("Stopping services...");
      await context.services.stopAll();
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

  /** Name the running services teardown is about to stop. */
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
      output(`${i === 0 ? "\n\n" : ""}Stopping ${svc.name}${where}`);
    }
  }

  async function startupSequence(output: (msg: string) => void): Promise<void> {
    try {
      // 1. Reactor (the client of its switchboard + drives + subscriptions)
      if (reactorConfig) {
        log.debug("Starting Reactor...");
        await getReactor();
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

      // 2. Routine (tick-based trigger loop)
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
