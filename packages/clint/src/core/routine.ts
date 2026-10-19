import type {
  AgentProvider,
  Command,
  CommandContext,
  CoreContext,
  EventBus,
  ProcessManager,
  Routine,
  RoutineStatus,
  StreamChunk,
  Trigger,
  TriggerContext,
  WorkItem,
  WrapRegistry,
} from "./types.js";
import type { ReactorContext } from "../integrations/powerhouse/types.js";
import { createEventBus } from "./events.js";
import { createProcessManager } from "./processes.js";
import { createMemoryWorkdirStore } from "./store.js";
import { IDENTITY_WRAPS } from "./wraps.js";

export interface RoutineOptions {
  triggers: Trigger<any, any, any>[];
  commands: Map<string, Command>;
  tickInterval?: number;
  idleInterval?: number;
  context?: CommandContext;
  eventBus?: EventBus;
  processManager?: ProcessManager;
  getReactor?: () => Promise<ReactorContext | undefined>;
  getAgent?: () => Promise<AgentProvider | undefined>;
}

/**
 * Create a routine — a tick-based execution loop with pluggable triggers.
 * Inspired by the agent prototype's AgentRoutine.
 *
 * State machine: init → ready → running ↔ stopping
 */
export function createRoutine(options: RoutineOptions): Routine {
  const tickInterval = options.tickInterval ?? 2000;
  const idleInterval = options.idleInterval ?? 500;
  const bus = options.eventBus ?? createEventBus();
  const pm = options.processManager ?? createProcessManager();
  let ctx: CommandContext = options.context ?? {
    workspace: createMemoryWorkdirStore(),
    config: {},
    workdir: "",
    stdout: console.log,
    runProcess: (cmd, opts) =>
      pm.run(cmd, { ...opts, onOutput: (line) => ctx.stdout(line + "\n") }),
  };
  // Ensure emit/on are wired from the event bus
  if (!ctx.emit)
    ctx.emit = (event: string, data?: unknown) => bus.emit(event, data);
  if (!ctx.on)
    ctx.on = (event: string, handler: (data?: unknown) => void) =>
      bus.on(event, handler);

  let status: RoutineStatus = "init";
  let loopPromise: Promise<void> | null = null;
  let stopRequested = false;

  const queue: WorkItem[] = [];

  // Mutable capability accessors — set after construction via setCapabilities()
  let getReactor: (() => Promise<ReactorContext | undefined>) | undefined =
    options.getReactor;
  let getAgent: (() => Promise<AgentProvider | undefined>) | undefined =
    options.getAgent;
  let wraps: WrapRegistry = IDENTITY_WRAPS;

  function makeTriggerContext(
    trigger: Trigger<any, any, any>,
  ): TriggerContext<any, any, any> {
    // Each trigger gets its own persistent state object. If the trigger
    // defines a `state()` initializer, it is called exactly once per
    // trigger instance before setup()/poll() run.
    const state: unknown = trigger.state ? trigger.state() : {};
    const reactorAccessor = () => getReactor?.() ?? Promise.resolve(undefined);
    const agentAccessor = () => getAgent?.() ?? Promise.resolve(undefined);
    return {
      get context(): CoreContext {
        return ctx;
      },
      get commandContext(): CommandContext {
        return { ...ctx, reactor: reactorAccessor, agent: agentAccessor };
      },
      state,
      reactor: reactorAccessor,
      agent: agentAccessor,
    } as TriggerContext<any, any, any>;
  }

  // Build trigger contexts once
  const triggerContexts = new Map<string, TriggerContext<any, any, any>>();
  for (const trigger of options.triggers) {
    triggerContexts.set(trigger.id, makeTriggerContext(trigger));
  }

  async function executeWorkItem(item: WorkItem): Promise<unknown> {
    switch (item.type) {
      case "function": {
        const fn = item.params.fn as () => Promise<unknown>;
        return fn();
      }

      case "command": {
        const commandId = item.params.commandId as string;
        const args = (item.params.args ?? {}) as Record<string, unknown>;
        const cmd = options.commands.get(commandId);
        if (!cmd) {
          throw new Error(`Unknown command: ${commandId}`);
        }
        const parsed = cmd.inputSchema.parse(args);
        // Provide extended context with routine, processes, emit
        const extCtx: CommandContext = {
          ...ctx,
          routine: routine,
          processes: pm,
          emit: (event: string, data?: unknown) => bus.emit(event, data),
        };
        return cmd.execute(parsed, extCtx);
      }

      default: {
        const _exhaustive: never = item.type;
        throw new Error(`Unknown work item type: ${_exhaustive}`);
      }
    }
  }

  async function loop(): Promise<void> {
    // Setup phase: call setup on all triggers
    for (const trigger of options.triggers) {
      if (trigger.setup) {
        const tCtx = triggerContexts.get(trigger.id)!;
        await trigger.setup(tCtx);
      }
    }

    status = "running";
    let iterationIndex = 0;

    while (!stopRequested) {
      const iterationStart = Date.now();

      // Each loop body is wrapped by the registered lifecycle hooks. Identity
      // by default — when no hook contributes, this is just `inner()`.
      await wraps.routineIteration({ index: iterationIndex }, async () => {
        // 1. Poll triggers for new work
        for (const trigger of options.triggers) {
          const tCtx = triggerContexts.get(trigger.id)!;
          try {
            const item = await trigger.poll(tCtx);
            if (item) {
              queue.push(item);
            }
          } catch (err) {
            // Trigger poll errors are logged but swallowed to keep the loop alive.
            // Use `ctx` (the live mutable reference) rather than `options.context`
            // which may be undefined when the routine was created without context.
            ctx.log?.warn?.(
              `[routine] trigger ${trigger.id} poll error: ${err instanceof Error ? err.message : String(err)}`,
            );
            ctx.log?.debug?.(
              `[routine] trigger ${trigger.id} stack: ${err instanceof Error ? err.stack : ""}`,
            );
          }
        }

        // 2. Execute next queued item (FIFO)
        if (queue.length > 0) {
          const item = queue.shift()!;
          try {
            const result = await executeWorkItem(item);
            if (routine.onOutput && result !== undefined && result !== null) {
              const text =
                typeof result === "object" &&
                result !== null &&
                "text" in result
                  ? ((result as Record<string, unknown>).text as string)
                  : String(result);
              if (text) routine.onOutput(text);
            }
            await item.callbacks?.onSuccess?.(result);
          } catch (error) {
            await item.callbacks?.onFailure?.(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      });
      iterationIndex++;

      // 3. Respect timing constraints
      const elapsed = Date.now() - iterationStart;
      const idle = Math.max(idleInterval, tickInterval - elapsed);
      await new Promise((r) => setTimeout(r, idle));
    }

    // Teardown triggers
    for (const trigger of options.triggers) {
      if (trigger.teardown) {
        try {
          await trigger.teardown(triggerContexts.get(trigger.id)!);
        } catch {
          // Swallow teardown errors to ensure all triggers get torn down
        }
      }
    }

    status = "ready";
    stopRequested = false;
  }

  const routine: Routine = {
    onOutput: undefined,
    onChunk: undefined,
    get status() {
      return status;
    },
    get triggerIds() {
      return options.triggers.map((t) => t.id);
    },
    get queueLength() {
      return queue.length;
    },
    start() {
      if (status === "running") return;
      if (status === "init" || status === "ready") {
        stopRequested = false;
        // Transition through ready if coming from init
        if (status === "init") {
          status = "ready";
        }
        loopPromise = loop();
      }
    },
    async stop() {
      if (status !== "running") return;
      status = "stopping";
      stopRequested = true;
      if (loopPromise) {
        await loopPromise;
        loopPromise = null;
      }
    },
    setContext(newCtx: CommandContext) {
      ctx = newCtx;
      // Ensure onOutput is always set so the stdout rewire never falls
      // through to raw terminal output in interactive mode.  When a
      // RoutineServiceAdapter exists it will have already set onOutput
      // (and chained onto this default); when it doesn't, we still need
      // a sink to prevent raw writes over the Ink UI.
      if (!routine.onOutput) {
        const buf: string[] = [];
        routine.onOutput = (text: string) => {
          buf.push(text);
          while (buf.length > 500) buf.shift();
        };
      }
      // Rewire ctx.stdout so all output (including runProcess lines) flows
      // through routine.onOutput → log buffer.
      ctx.stdout = (text: string) => {
        routine.onOutput!(text);
      };
      // Rewire ctx.runProcess to emit structured StreamChunks so the Repl
      // can render background process output in rolling window segments.
      ctx.runProcess = (cmd, opts) => {
        const toolName = cmd;
        let segmentOpened = false;
        return pm
          .run(cmd, {
            ...opts,
            onOutput: (line: string) => {
              if (!segmentOpened) {
                segmentOpened = true;
                routine.onChunk?.({ type: "tool-call", toolName, args: {} });
              }
              routine.onChunk?.({ type: "tool-output", toolName, text: line });
              routine.onOutput?.(line);
            },
          })
          .then((result) => {
            if (segmentOpened) {
              const chunk: StreamChunk = {
                type: "tool-result",
                toolName,
                result: { text: `exit ${result.success ? 0 : 1}` },
                isError: !result.success,
              };
              routine.onChunk?.(chunk);
            }
            return result;
          });
      };
    },
    setCapabilities(caps) {
      // Erase R at storage — the registry generic is only for caller-side
      // type-checking of the returned ReactorContext.
      if (caps.getReactor) {
        getReactor = caps.getReactor as unknown as typeof getReactor;
      }
      if (caps.getAgent) getAgent = caps.getAgent;
      if (caps.wraps) wraps = caps.wraps;
    },
  };

  return routine;
}
