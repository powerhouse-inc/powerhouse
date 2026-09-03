// Polling-trigger supervisor: owns piece-trigger lifecycle (enable/disable)
// and the poll tick; cursors persist in trigger_state via the stage-1 protocol.
import {
  ensurePieceBundle,
  extractDedupeKey,
  PieceWorker,
  type PieceWorkerResult,
  type RecordedSchedule,
  type TriggerHookRequest,
} from "@powerhousedao/reactor-connectors";
import { childLogger } from "document-model";
import { createHash } from "node:crypto";
import type { TriggerStateRow, WorkflowRunStore } from "./store.js";

const logger = childLogger(["workflow", "trigger-supervisor"]);

export interface PieceTriggerBinding {
  workflowId: string;
  blockType: string;
  packageName: string;
  version: string;
  triggerName: string;
  config: Record<string, unknown>;
  connectionId?: string | null;
}

export interface TriggerSupervisorOptions {
  store: () => Promise<WorkflowRunStore | undefined>;
  resolveAuth: (connectionId: string | null | undefined) => Promise<unknown>;
  fire: (workflowId: string, payload: unknown, kind: string) => void;
  cacheDir: string;
  worker?: PieceWorker;
  tickMs?: number;
  defaultIntervalMs?: number;
  hookTimeoutMs?: number;
}

const MIN_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;
const DEDUPE_TTL_MS = 30_000;

export function configHash(blockType: string, config: unknown): string {
  return createHash("sha256")
    .update(blockType)
    .update(JSON.stringify(config ?? {}))
    .digest("hex")
    .slice(0, 16);
}

// "*/N * * * *" is the only cron shape honoured; anything else logs and
// falls back to the default interval (no cron engine in the tree).
export function intervalFromSchedules(
  schedules: RecordedSchedule[] | undefined,
  defaultMs: number,
): number {
  const cron = schedules?.at(-1)?.cronExpression;
  if (!cron) return Math.max(defaultMs, MIN_INTERVAL_MS);
  const match = /^\*\/(\d+) \* \* \* \*$/.exec(cron.trim());
  if (!match) {
    logger.warn(`Unsupported setSchedule cron "${cron}"; using the default`);
    return Math.max(defaultMs, MIN_INTERVAL_MS);
  }
  return Math.max(Number(match[1]) * 60_000, MIN_INTERVAL_MS);
}

function parseStoreState(row: TriggerStateRow): Record<string, unknown> {
  try {
    return JSON.parse(row.store_state) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export class TriggerSupervisor {
  private readonly bindings = new Map<string, PieceTriggerBinding>();
  private readonly worker: PieceWorker;
  private readonly tickMs: number;
  private readonly defaultIntervalMs: number;
  private readonly hookTimeoutMs: number;
  private timer?: NodeJS.Timeout;
  // Lifecycle ops serialize so enable/disable/poll never interleave per store.
  private ops: Promise<unknown> = Promise.resolve();
  private ticking = false;

  constructor(private readonly options: TriggerSupervisorOptions) {
    this.worker = options.worker ?? new PieceWorker();
    this.tickMs = options.tickMs ?? 15_000;
    this.defaultIntervalMs = options.defaultIntervalMs ?? 300_000;
    this.hookTimeoutMs = options.hookTimeoutMs ?? 60_000;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((error: unknown) => {
        logger.error("Trigger tick failed", error);
      });
    }, this.tickMs);
    this.timer.unref();
    logger.info(`Trigger supervisor started (tick ${this.tickMs}ms)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (!this.options.worker) this.worker.dispose();
    logger.info("Trigger supervisor stopped");
  }

  // Serialized: registration churn and ticks share one lane.
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.ops.then(task);
    this.ops = run.catch(() => undefined);
    return run;
  }

  upsert(binding: PieceTriggerBinding): Promise<void> {
    this.bindings.set(binding.workflowId, binding);
    return this.enqueue(() => this.enable(binding));
  }

  remove(workflowId: string): Promise<void> {
    const binding = this.bindings.get(workflowId);
    this.bindings.delete(workflowId);
    return this.enqueue(() => this.disable(workflowId, binding));
  }

  // Design-time sample: the worker's "test" store prefix keeps cursors intact,
  // and no store state is persisted back.
  test(binding: PieceTriggerBinding): Promise<unknown> {
    return this.enqueue(async () => {
      const store = await this.options.store();
      const row = await store?.getTriggerState(binding.workflowId);
      const seed = row ? parseStoreState(row) : {};
      const result = await this.hook(binding, "test", seed);
      return result.output;
    });
  }

  private async hook(
    binding: PieceTriggerBinding,
    hook: TriggerHookRequest["hook"],
    storeState: Record<string, unknown>,
    isRepublish?: boolean,
  ): Promise<PieceWorkerResult> {
    const bundle = await ensurePieceBundle({
      name: binding.packageName,
      version: binding.version,
      cacheDir: this.options.cacheDir,
    });
    const auth = await this.options.resolveAuth(binding.connectionId);
    return this.worker.runTriggerHook(
      {
        bundleDir: bundle.dir,
        triggerName: binding.triggerName,
        hook,
        propsValue: binding.config,
        auth,
        storeState,
        identity: { flowId: binding.workflowId },
        isRepublish,
        webhookUrl: `http://localhost:0/v1/webhooks/${binding.workflowId}`,
      },
      { timeoutMs: this.hookTimeoutMs },
    );
  }

  private async enable(binding: PieceTriggerBinding): Promise<void> {
    const store = await this.options.store();
    if (!store) return;
    const hash = configHash(binding.blockType, binding.config);
    const existing = await store.getTriggerState(binding.workflowId);
    const isRepublish = existing?.config_hash === hash;
    if (existing && !isRepublish && existing.status === "ENABLED") {
      // The trigger changed: release the old registration first.
      await this.disableRow(binding.workflowId, existing);
    }
    const seed = existing && isRepublish ? parseStoreState(existing) : {};
    const now = new Date();
    try {
      const result = await this.hook(binding, "onEnable", seed, isRepublish);
      const intervalMs = intervalFromSchedules(
        result.schedules,
        this.defaultIntervalMs,
      );
      await store.upsertTriggerState({
        workflow_id: binding.workflowId,
        block_type: binding.blockType,
        config_hash: hash,
        status: "ENABLED",
        store_state: JSON.stringify(result.storeState ?? {}),
        interval_ms: intervalMs,
        next_poll_at: new Date(now.getTime() + intervalMs).toISOString(),
        last_poll_at: null,
        last_error: null,
        consecutive_failures: 0,
        lease_owner: null,
        lease_expires_at: null,
        updated_at: now.toISOString(),
      });
      logger.info(
        `Enabled ${binding.blockType} for workflow ${binding.workflowId} (every ${intervalMs}ms)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // onEnable failed: record the error and do not schedule polls.
      await store.upsertTriggerState({
        workflow_id: binding.workflowId,
        block_type: binding.blockType,
        config_hash: hash,
        status: "ERROR",
        store_state: existing?.store_state ?? "{}",
        interval_ms: this.defaultIntervalMs,
        next_poll_at: null,
        last_poll_at: null,
        last_error: message,
        consecutive_failures: (existing?.consecutive_failures ?? 0) + 1,
        lease_owner: null,
        lease_expires_at: null,
        updated_at: now.toISOString(),
      });
      logger.error(
        `onEnable failed for workflow ${binding.workflowId}: ${message}`,
      );
    }
  }

  private async disable(
    workflowId: string,
    binding?: PieceTriggerBinding,
  ): Promise<void> {
    const store = await this.options.store();
    if (!store) return;
    const row = await store.getTriggerState(workflowId);
    if (!row || row.status === "DISABLED") return;
    await this.disableRow(workflowId, row, binding);
  }

  // store_state is kept: an unchanged re-enable republishes onto the cursor.
  private async disableRow(
    workflowId: string,
    row: TriggerStateRow,
    binding?: PieceTriggerBinding,
  ): Promise<void> {
    const store = await this.options.store();
    if (!store) return;
    const target = binding ?? this.bindingFromRow(row);
    if (target) {
      try {
        await this.hook(target, "onDisable", parseStoreState(row));
      } catch (error) {
        logger.warn(`onDisable failed for workflow ${workflowId}`, error);
      }
    }
    await store.setTriggerStatus(workflowId, "DISABLED");
  }

  private bindingFromRow(row: TriggerStateRow): PieceTriggerBinding | undefined {
    return this.bindings.get(row.workflow_id);
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.enqueue(() => this.pollDue());
    } finally {
      this.ticking = false;
    }
  }

  private async pollDue(): Promise<void> {
    const store = await this.options.store();
    if (!store) return;
    const due = await store.listDueTriggerStates(new Date().toISOString());
    for (const row of due) {
      const binding = this.bindings.get(row.workflow_id);
      if (!binding) {
        // Zombie row: the registry no longer knows this workflow.
        await store.setTriggerStatus(row.workflow_id, "DISABLED");
        continue;
      }
      await this.poll(store, row, binding);
    }
  }

  private async poll(
    store: WorkflowRunStore,
    row: TriggerStateRow,
    binding: PieceTriggerBinding,
  ): Promise<void> {
    const now = new Date();
    try {
      const result = await this.hook(binding, "run", parseStoreState(row));
      if (!Array.isArray(result.output)) {
        throw new Error(
          `Trigger run returned ${typeof result.output}, expected an array`,
        );
      }
      await store.recordPollSuccess(
        row.workflow_id,
        JSON.stringify(result.storeState ?? {}),
        now.toISOString(),
        new Date(now.getTime() + row.interval_ms).toISOString(),
      );
      for (const item of result.output) {
        await this.fireItem(store, binding, item, now);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failures = row.consecutive_failures + 1;
      const backoff = Math.min(
        row.interval_ms * 2 ** failures,
        MAX_BACKOFF_MS,
      );
      await store.recordPollFailure(
        row.workflow_id,
        message,
        now.toISOString(),
        new Date(now.getTime() + backoff).toISOString(),
        failures,
      );
      logger.warn(
        `Poll failed for workflow ${row.workflow_id} (${failures}x): ${message}`,
      );
    }
  }

  // One workflow run per output item; _dedupe_key suppresses 30s repeats.
  private async fireItem(
    store: WorkflowRunStore,
    binding: PieceTriggerBinding,
    item: unknown,
    now: Date,
  ): Promise<void> {
    const dedupeKey = extractDedupeKey(item);
    if (dedupeKey) {
      const claimed = await store.claimDedupe(
        binding.workflowId,
        dedupeKey,
        DEDUPE_TTL_MS,
        now.toISOString(),
      );
      if (!claimed) return;
    }
    this.options.fire(
      binding.workflowId,
      item,
      `piece:${binding.blockType}`,
    );
  }
}
