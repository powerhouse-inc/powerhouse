// Timer-driven trigger supervisor: owns piece-trigger lifecycle (enable/
// disable, poll cursors) and core#schedule fires; state lives in trigger_state.
import {
  DEFAULT_EGRESS_POLICY,
  ensurePieceBundle,
  extractDedupeKey,
  PieceWorker,
  PieceWorkerError,
  type ConnectionRequest,
  type ConnectorDescriptor,
  type EgressPolicy,
  type PieceWorkerResult,
  type RecordedSchedule,
  type TriggerHookRequest,
} from "@powerhousedao/reactor-connectors";
import { childLogger } from "document-model";
import { createHash } from "node:crypto";
import {
  cronIntervalMs,
  MIN_SCHEDULE_INTERVAL_MS,
  nextFireAt,
  parseScheduleConfig,
  rescheduleAfterFire,
  schedulePayload,
  SCHEDULE_BLOCK,
} from "./schedule.js";
import type { TriggerStateRow, WorkflowRunStore } from "./store.js";

const logger = childLogger(["workflow", "trigger-supervisor"]);

export interface PieceTriggerBinding {
  kind?: "piece";
  workflowId: string;
  blockType: string;
  packageName: string;
  version: string;
  triggerName: string;
  config: Record<string, unknown>;
  connectionId?: string | null;
  // Author's poll cadence, from the trigger's pollEverySeconds. Overrides both
  // the piece's own setSchedule and the runtime default; the 60s floor holds.
  pollIntervalMs?: number;
}

// core#schedule: no piece hooks; next_poll_at is the next fire time.
export interface ScheduleTriggerBinding {
  kind: "schedule";
  workflowId: string;
  blockType: typeof SCHEDULE_BLOCK;
  config: Record<string, unknown>;
}

export type TriggerBinding = PieceTriggerBinding | ScheduleTriggerBinding;

export const SCHEDULE_TRIGGER_KIND = "schedule";

export interface TriggerSupervisorOptions {
  store: () => Promise<WorkflowRunStore | undefined>;
  resolveAuth: (
    connectionId: string | null | undefined,
    request?: ConnectionRequest,
  ) => Promise<unknown>;
  fire: (workflowId: string, payload: unknown, kind: string) => void;
  cacheDir: string;
  worker?: PieceWorker;
  // Where a trigger's piece may connect to. Left unset it is the default
  // policy, which refuses private address space; `null` lifts it entirely.
  egress?: EgressPolicy | null;
  tickMs?: number;
  defaultIntervalMs?: number;
  hookTimeoutMs?: number;
  // The endpoint a WEBHOOK-strategy piece registers with its provider, minted
  // per workflow by the reactor's webhook service. Without one, such a trigger
  // refuses to enable rather than registering a URL nothing can reach.
  webhookUrlFor?: (workflowId: string) => Promise<string | undefined>;
  // How often a webhook trigger reconciles by polling anyway. A provider that
  // drops a delivery — paperless never retries a transport error — would
  // otherwise lose the event for good.
  reconcileIntervalMs?: number;
  // Clock override for tests; defaults to the wall clock.
  now?: () => Date;
}

const MIN_INTERVAL_MS = MIN_SCHEDULE_INTERVAL_MS;
const MAX_BACKOFF_MS = 30 * 60_000;
const DEDUPE_TTL_MS = 30_000;
const DEFAULT_RECONCILE_INTERVAL_MS = 15 * 60_000;

function isSchedule(
  binding: TriggerBinding,
): binding is ScheduleTriggerBinding {
  return binding.kind === "schedule";
}

export function configHash(blockType: string, config: unknown): string {
  return createHash("sha256")
    .update(blockType)
    .update(JSON.stringify(config ?? {}))
    .digest("hex")
    .slice(0, 16);
}

// The poll cadence a piece asked for via setSchedule: the gap between the
// cron's next two runs (60s floor); unparseable crons fall back to the default.
export function intervalFromSchedules(
  schedules: RecordedSchedule[] | undefined,
  defaultMs: number,
): number {
  const cron = schedules?.at(-1)?.cronExpression;
  if (!cron) return Math.max(defaultMs, MIN_INTERVAL_MS);
  const intervalMs = cronIntervalMs(cron);
  if (intervalMs === undefined) {
    logger.warn(`Unsupported setSchedule cron "${cron}"; using the default`);
    return Math.max(defaultMs, MIN_INTERVAL_MS);
  }
  return intervalMs;
}

// The cadence to poll a piece trigger at: the author's override when set,
// else what the piece asked for, else the runtime default. Never below the floor.
export function pollIntervalFor(
  binding: PieceTriggerBinding,
  schedules: RecordedSchedule[] | undefined,
  defaultMs: number,
): number {
  if (binding.pollIntervalMs !== undefined) {
    return Math.max(binding.pollIntervalMs, MIN_INTERVAL_MS);
  }
  return intervalFromSchedules(schedules, defaultMs);
}

function parseStoreState(row: TriggerStateRow): Record<string, unknown> {
  try {
    return JSON.parse(row.store_state) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// A failure the operator has to fix: retrying it only burns cycles and buries
// the real error under a growing failure count.
export class TriggerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TriggerConfigError";
  }
}

// Everything a piece throws looks alike once it crosses the worker boundary —
// an expired token and a timeout are both name/message.

// So only failures we can name structurally park; the rest retry.
function isPermanentFailure(error: unknown): boolean {
  if (error instanceof TriggerConfigError) return true;
  return (
    error instanceof PieceWorkerError &&
    error.serialized.unsupportedMember !== undefined
  );
}

interface EnableRetry {
  // Epoch ms of the next attempt.
  at: number;
  failures: number;
  // The last attempt reached onEnable, so the provider may be holding a
  // registration the next attempt has to release before making another.
  release: boolean;
}

// Same shape the poll path backs off with, so a trigger that cannot enable and
// one that cannot poll retreat at the same rate and to the same ceiling.
function backoffMs(intervalMs: number, failures: number): number {
  return Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS);
}

// pollingHelper's TIMEBASED cursor, under the trigger's store scope prefix.
const CURSOR_KEY = "lastPoll";

// A provider's clock can run ahead of ours; beyond a day it is not skew, it is
// a cursor that would hold the trigger silent until that date passes.
const MAX_CURSOR_SKEW_MS = 24 * 60 * 60_000;

function isPlausibleCursor(value: unknown, now: Date): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= now.getTime() + MAX_CURSOR_SKEW_MS
  );
}

// NaN and Infinity both serialise as "null", which is the one thing an
// operator reading this warning must not be told.
function showCursor(value: unknown): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

// The worker JSON-serialises the store before we see it, so a NaN or Infinity
// cursor arrives as null — still ours to reject, just no longer a number.
function isCursorShaped(value: unknown): boolean {
  return value === null || typeof value === "number";
}

// The cursor comes back unchecked: `Math.max` over one unparseable date yields
// NaN, which then re-delivers the whole feed forever, or nothing ever again.

// A rejected cursor falls back to the previous value; with none to fall back
// to, the key is dropped and the next poll fails loudly instead.
function sanitizeStoreState(
  workflowId: string,
  next: Record<string, unknown> | undefined,
  previous: Record<string, unknown>,
  now: Date,
): string {
  // No store state at all is the worker saying nothing, not the piece clearing
  // its cursor; wiping it here would re-deliver the backlog.
  if (!next) return JSON.stringify(previous);
  const state: Record<string, unknown> = { ...next };
  for (const [key, value] of Object.entries(state)) {
    if (key !== CURSOR_KEY && !key.endsWith(`/${CURSOR_KEY}`)) continue;
    if (isPlausibleCursor(value, now)) continue;
    const kept = previous[key];
    // Only our own cursor shape is ours to police: a piece that keeps its own
    // `lastPoll` as a string or an object is left to it.
    if (!isCursorShaped(value) && !isPlausibleCursor(kept, now)) continue;
    const keptLabel = isPlausibleCursor(kept, now) ? String(kept) : "no cursor";
    logger.warn(
      `Rejected ${key}=${showCursor(value)} from workflow ${workflowId}; ` +
        `keeping ${keptLabel}`,
    );
    if (isPlausibleCursor(kept, now)) state[key] = kept;
    else delete state[key];
  }
  return JSON.stringify(state);
}

export class TriggerSupervisor {
  private readonly bindings = new Map<string, TriggerBinding>();
  private readonly worker: PieceWorker;
  private readonly tickMs: number;
  private readonly defaultIntervalMs: number;
  private readonly hookTimeoutMs: number;
  private readonly now: () => Date;
  private readonly egress: EgressPolicy | undefined;
  private timer?: NodeJS.Timeout;
  // Lifecycle ops serialize so enable/disable/poll never interleave per store.
  private ops: Promise<unknown> = Promise.resolve();
  private ticking = false;

  constructor(private readonly options: TriggerSupervisorOptions) {
    this.worker = options.worker ?? new PieceWorker();
    this.tickMs = options.tickMs ?? 15_000;
    this.defaultIntervalMs = options.defaultIntervalMs ?? 300_000;
    this.hookTimeoutMs = options.hookTimeoutMs ?? 60_000;
    this.now = options.now ?? (() => new Date());
    this.egress =
      options.egress === undefined
        ? DEFAULT_EGRESS_POLICY
        : (options.egress ?? undefined);
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

  // Successfully enabled workflows; identical re-registrations are no-ops.
  private readonly enabledOk = new Set<string>();

  // Piece descriptors by package@version, for the trigger strategy lookup.
  private readonly descriptors = new Map<string, ConnectorDescriptor>();

  // Workflows whose onEnable failed and when to try again. The ERROR row keeps
  // the same time so a restart resumes the backoff instead of restarting it.
  private readonly enableRetries = new Map<string, EnableRetry>();

  upsert(binding: TriggerBinding): Promise<void> {
    const previous = this.bindings.get(binding.workflowId);
    if (
      previous &&
      this.enabledOk.has(binding.workflowId) &&
      JSON.stringify(previous) === JSON.stringify(binding)
    ) {
      return Promise.resolve();
    }
    this.bindings.set(binding.workflowId, binding);
    // The binding it replaces is the only thing that can still name the old
    // registration: the row holds neither the config nor the connection.
    return this.enqueue(() => this.enable(binding, previous));
  }

  remove(workflowId: string): Promise<void> {
    const binding = this.bindings.get(workflowId);
    this.bindings.delete(workflowId);
    this.enabledOk.delete(workflowId);
    this.enableRetries.delete(workflowId);
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

  // The sender's probe, answered by the piece rather than by us: only its own
  // code knows what the sender wants echoed back. Serialised with
  // enable/disable like a delivery, so a probe arriving during a
  // re-registration cannot read a half-written store.
  handshake(
    binding: PieceTriggerBinding,
    payload: unknown,
  ): Promise<PieceWorkerResult> {
    return this.enqueue(async () => {
      const store = await this.options.store();
      const row = await store?.getTriggerState(binding.workflowId);
      return this.hook(binding, "onHandshake", row ? parseStoreState(row) : {}, {
        payload,
      });
    });
  }

  // Ingress path: a verified delivery runs the trigger's `run` hook with the
  // payload, then goes through the same dedupe and fire path a poll does. The
  // resolver never waits for this — providers time out fast (paperless allows
  // five seconds) and a slow run would look like a failed delivery.
  deliverWebhook(workflowId: string, payload: unknown): Promise<void> {
    return this.enqueue(async () => {
      const binding = this.bindings.get(workflowId);
      if (!binding || isSchedule(binding)) {
        logger.warn(`Webhook delivery for unknown workflow ${workflowId}`);
        return;
      }
      const store = await this.options.store();
      if (!store) return;
      const row = await store.getTriggerState(workflowId);
      const now = this.now();
      const previous = row ? parseStoreState(row) : {};
      const result = await this.hook(binding, "run", previous, { payload });
      // A delivery to a trigger that never enabled still fires, but it must not
      // clear the enable error or reset the backoff by recording a success.
      if (row?.status === "ENABLED") {
        await store.recordPollSuccess(
          workflowId,
          sanitizeStoreState(workflowId, result.storeState, previous, now),
          now.toISOString(),
          new Date(now.getTime() + row.interval_ms).toISOString(),
        );
      }
      const items = Array.isArray(result.output) ? result.output : [];
      for (const item of items) {
        await this.fireItem(store, binding, item, now);
      }
    });
  }

  private async hook(
    binding: PieceTriggerBinding,
    hook: TriggerHookRequest["hook"],
    storeState: Record<string, unknown>,
    options: { isRepublish?: boolean; payload?: unknown; webhookUrl?: string } = {},
  ): Promise<PieceWorkerResult> {
    const bundle = await ensurePieceBundle({
      name: binding.packageName,
      version: binding.version,
      cacheDir: this.options.cacheDir,
    });
    // A trigger's connection is the workflow's own, declared beside it, so it
    // needs no run binding — but it is still bound to its connector.
    const auth = await this.options.resolveAuth(binding.connectionId, {
      blockType: binding.blockType,
      piecePackage: binding.packageName,
    });
    return this.worker.runTriggerHook(
      {
        bundleDir: bundle.dir,
        triggerName: binding.triggerName,
        hook,
        propsValue: binding.config,
        auth,
        storeState,
        identity: { flowId: binding.workflowId },
        isRepublish: options.isRepublish,
        payload: options.payload,
        // A poll binding gets an unroutable URL on purpose: a live one would
        // let a piece register an endpoint that nothing ever delivers to.
        webhookUrl:
          options.webhookUrl ??
          `http://localhost:0/v1/webhooks/${binding.workflowId}`,
        ...(this.egress ? { egress: this.egress } : {}),
      },
      { timeoutMs: this.hookTimeoutMs },
    );
  }

  // A trigger's strategy lives in the piece descriptor, so it takes loading
  // the bundle. Enables are rare and the descriptor is cached per version.
  private async strategyFor(
    binding: PieceTriggerBinding,
  ): Promise<string> {
    const key = `${binding.packageName}@${binding.version}`;
    let descriptor = this.descriptors.get(key);
    if (!descriptor) {
      const bundle = await ensurePieceBundle({
        name: binding.packageName,
        version: binding.version,
        cacheDir: this.options.cacheDir,
      });
      const result = await this.worker.describePiece(
        {
          bundleDir: bundle.dir,
          packageName: binding.packageName,
          version: binding.version,
          ...(this.egress ? { egress: this.egress } : {}),
        },
        { timeoutMs: this.hookTimeoutMs },
      );
      descriptor = result.output as ConnectorDescriptor;
      this.descriptors.set(key, descriptor);
    }
    const trigger = descriptor.triggers?.find(
      (candidate) => candidate.name === binding.triggerName,
    );
    return trigger?.strategy ?? "POLLING";
  }

  private async enable(
    binding: TriggerBinding,
    superseded?: TriggerBinding,
  ): Promise<void> {
    const store = await this.options.store();
    if (!store) return;
    const hash = configHash(binding.blockType, binding.config);
    const existing = await store.getTriggerState(binding.workflowId);
    const now = this.now();
    // Only a completed enable is a republish: a retry after a failed one must
    // register again, or a piece that skips registration never delivers.
    const isRepublish =
      existing?.config_hash === hash && existing.status === "ENABLED";
    if (existing && !isRepublish && existing.status === "ENABLED") {
      // The trigger changed: release the old registration first.
      await this.disableRow(binding.workflowId, existing, superseded);
    }
    const pending = this.enableRetries.get(binding.workflowId);
    if (isSchedule(binding)) {
      // A piece trigger replaced by core#schedule takes its retry with it;
      // left behind, the entry wins a slot on every tick and never resolves.
      this.enableRetries.delete(binding.workflowId);
      if (pending?.release && existing && superseded && !isSchedule(superseded)) {
        await this.releaseRegistration(superseded, existing);
      }
      await this.enableSchedule(store, binding, hash, existing);
      return;
    }
    if (this.deferToStoredRetry(binding, hash, existing, now)) return;
    if (pending?.release && existing) {
      // The failed attempt may have subscribed at the provider already, and
      // only one subscription is ever released; drop it before making another.
      await this.releaseRegistration(binding, existing);
    }
    const seed = existing && isRepublish ? parseStoreState(existing) : {};
    let reachedProvider = false;
    try {
      const strategy = await this.strategyFor(binding);
      const webhook = strategy === "WEBHOOK" || strategy === "APP_WEBHOOK";
      // The reactor's webhook service owns the token and the URL it lives in,
      // so the piece is handed an address rather than a credential to place.
      const webhookUrl = webhook
        ? await this.webhookUrlOrThrow(binding.workflowId)
        : undefined;
      reachedProvider = true;
      const result = await this.hook(binding, "onEnable", seed, {
        isRepublish,
        webhookUrl,
      });
      // A webhook trigger still polls, just slowly: the poll is the
      // reconciliation sweep that recovers deliveries the provider dropped.
      const intervalMs = webhook
        ? (this.options.reconcileIntervalMs ?? DEFAULT_RECONCILE_INTERVAL_MS)
        : pollIntervalFor(binding, result.schedules, this.defaultIntervalMs);
      await store.upsertTriggerState({
        workflow_id: binding.workflowId,
        block_type: binding.blockType,
        config_hash: hash,
        status: "ENABLED",
        store_state: sanitizeStoreState(
          binding.workflowId,
          result.storeState,
          seed,
          now,
        ),
        interval_ms: intervalMs,
        next_poll_at: new Date(now.getTime() + intervalMs).toISOString(),
        last_poll_at: null,
        last_error: null,
        consecutive_failures: 0,
        lease_owner: null,
        lease_expires_at: null,
        updated_at: now.toISOString(),
      });
      this.enabledOk.add(binding.workflowId);
      this.enableRetries.delete(binding.workflowId);
      logger.info(
        `Enabled ${binding.blockType} for workflow ${binding.workflowId} (every ${intervalMs}ms)`,
      );
    } catch (error) {
      this.enabledOk.delete(binding.workflowId);
      const message = error instanceof Error ? error.message : String(error);
      const failures = (existing?.consecutive_failures ?? 0) + 1;
      const intervalMs = pollIntervalFor(
        binding,
        undefined,
        this.defaultIntervalMs,
      );
      // A third-party API down for a minute must not park the trigger for good,
      // so onEnable retries on the tick loop; the row stays ERROR until it takes.
      const retryAt = isPermanentFailure(error)
        ? undefined
        : new Date(now.getTime() + backoffMs(intervalMs, failures));
      if (retryAt) {
        this.enableRetries.set(binding.workflowId, {
          at: retryAt.getTime(),
          failures,
          release: reachedProvider,
        });
      } else this.enableRetries.delete(binding.workflowId);
      await store.upsertTriggerState({
        workflow_id: binding.workflowId,
        block_type: binding.blockType,
        config_hash: hash,
        status: "ERROR",
        store_state: existing?.store_state ?? "{}",
        interval_ms: intervalMs,
        next_poll_at: retryAt?.toISOString() ?? null,
        last_poll_at: null,
        last_error: message,
        consecutive_failures: failures,
        lease_owner: null,
        lease_expires_at: null,
        updated_at: now.toISOString(),
      });
      logger.error(
        `onEnable failed for workflow ${binding.workflowId} (${failures}x): ${message}` +
          (retryAt ? `; retrying at ${retryAt.toISOString()}` : "; not retrying"),
      );
    }
  }

  // A reactor with no webhook service will never mint a URL; one that has not
  // finished starting has simply not minted this workflow's yet.
  private async webhookUrlOrThrow(workflowId: string): Promise<string> {
    const mint = this.options.webhookUrlFor;
    if (!mint) {
      throw new TriggerConfigError(
        "This trigger delivers by webhook, but no public webhook endpoint is configured for the reactor",
      );
    }
    const url = await mint(workflowId);
    if (!url) {
      throw new Error(
        "The reactor's webhook endpoint is not available yet for this workflow",
      );
    }
    return url;
  }

  // Backoff that only lives in memory is no backoff at all against a crash
  // loop, so a restart picks the retry time back up off the row.

  // A re-registration of the same config waits its turn too; only a changed
  // config is an operator saying "try this one now".
  private deferToStoredRetry(
    binding: PieceTriggerBinding,
    hash: string,
    existing: TriggerStateRow | undefined,
    now: Date,
  ): boolean {
    if (existing?.status !== "ERROR" || existing.config_hash !== hash) {
      return false;
    }
    const pending = this.enableRetries.get(binding.workflowId);
    const stored = existing.next_poll_at ? Date.parse(existing.next_poll_at) : NaN;
    const at = pending?.at ?? (Number.isFinite(stored) ? stored : undefined);
    if (at === undefined || at <= now.getTime()) return false;
    if (!pending) {
      this.enableRetries.set(binding.workflowId, {
        at,
        failures: existing.consecutive_failures,
        // Nothing in memory says how far the pre-restart attempt got, and a
        // stale subscription costs more than a redundant onDisable.
        release: true,
      });
      logger.info(
        `Enable for workflow ${binding.workflowId} still backing off until ${existing.next_poll_at}`,
      );
    }
    return true;
  }

  // Best effort: the ids a piece unsubscribes with reach us only when onEnable
  // returns, so a timed-out first attempt has nothing here to release with.

  // Closing that gap needs the worker to report store writes as they happen.
  private async releaseRegistration(
    binding: PieceTriggerBinding,
    row: TriggerStateRow,
  ): Promise<void> {
    try {
      await this.hook(binding, "onDisable", parseStoreState(row));
    } catch (error) {
      logger.warn(
        `onDisable before retrying workflow ${binding.workflowId} failed`,
        error,
      );
    }
  }

  // An unchanged, still-ENABLED row keeps its next fire time: that is what
  // carries a schedule across a restart. Anything else rebases on now.
  private async enableSchedule(
    store: WorkflowRunStore,
    binding: ScheduleTriggerBinding,
    hash: string,
    existing: TriggerStateRow | undefined,
  ): Promise<void> {
    const now = this.now();
    const base = {
      workflow_id: binding.workflowId,
      block_type: binding.blockType,
      config_hash: hash,
      store_state: "{}",
      last_poll_at: existing?.last_poll_at ?? null,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: now.toISOString(),
    };
    try {
      const schedule = parseScheduleConfig(binding.config);
      const carried =
        existing?.status === "ENABLED" && existing.config_hash === hash
          ? existing.next_poll_at
          : null;
      const nextAt = carried ? new Date(carried) : nextFireAt(schedule, now);
      await store.upsertTriggerState({
        ...base,
        status: "ENABLED",
        interval_ms:
          schedule.mode === "interval"
            ? schedule.everyMs
            : MIN_SCHEDULE_INTERVAL_MS,
        next_poll_at: nextAt.toISOString(),
        last_error: null,
        consecutive_failures: 0,
      });
      this.enabledOk.add(binding.workflowId);
      logger.info(
        `Scheduled workflow ${binding.workflowId}: next fire ${nextAt.toISOString()}` +
          (carried ? " (carried over)" : ""),
      );
    } catch (error) {
      this.enabledOk.delete(binding.workflowId);
      const message = error instanceof Error ? error.message : String(error);
      await store.upsertTriggerState({
        ...base,
        status: "ERROR",
        interval_ms: MIN_SCHEDULE_INTERVAL_MS,
        next_poll_at: null,
        last_error: message,
        consecutive_failures: (existing?.consecutive_failures ?? 0) + 1,
      });
      logger.error(
        `Invalid schedule for workflow ${binding.workflowId}: ${message}`,
      );
    }
  }

  private async disable(
    workflowId: string,
    binding?: TriggerBinding,
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
    binding?: TriggerBinding,
  ): Promise<void> {
    const store = await this.options.store();
    if (!store) return;
    const target = binding ?? this.bindingFromRow(row);
    if (target && !isSchedule(target) && row.block_type !== SCHEDULE_BLOCK) {
      try {
        await this.hook(target, "onDisable", parseStoreState(row));
      } catch (error) {
        logger.warn(`onDisable failed for workflow ${workflowId}`, error);
      }
    }
    await store.setTriggerStatus(workflowId, "DISABLED");
  }

  private bindingFromRow(row: TriggerStateRow): TriggerBinding | undefined {
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

  // An ERROR row is never due for a poll, so the enable retry rides the same
  // tick rather than a timer of its own.

  // One per tick, and after the due rows: an enable hook can burn the whole
  // hook timeout, and a queue of them must not push schedule fires late.
  private async retryOneEnable(): Promise<void> {
    const now = this.now().getTime();
    const next = [...this.enableRetries]
      .filter(([, retry]) => retry.at <= now)
      .sort((a, b) => a[1].at - b[1].at)
      .at(0);
    if (!next) return;
    const [workflowId, retry] = next;
    const binding = this.bindings.get(workflowId);
    if (!binding) {
      this.enableRetries.delete(workflowId);
      return;
    }
    // The entry is only dropped by an attempt that got as far as writing its
    // own outcome; anything else keeps it, backed off, rather than parking.
    try {
      await this.enable(binding);
    } catch (error) {
      const failures = retry.failures + 1;
      // The same cadence the attempt itself would have backed off on: a store
      // that just failed is the last thing to poll faster than configured.
      const intervalMs = isSchedule(binding)
        ? MIN_INTERVAL_MS
        : pollIntervalFor(binding, undefined, this.defaultIntervalMs);
      this.enableRetries.set(workflowId, {
        at: now + backoffMs(intervalMs, failures),
        failures,
        release: retry.release,
      });
      logger.error(`Enable retry for workflow ${workflowId} threw`, error);
    }
  }

  private async pollDue(): Promise<void> {
    const store = await this.options.store();
    if (!store) return;
    const due = await store.listDueTriggerStates(this.now().toISOString());
    for (const row of due) {
      const binding = this.bindings.get(row.workflow_id);
      if (!binding) {
        // Zombie row: the registry no longer knows this workflow.
        await store.setTriggerStatus(row.workflow_id, "DISABLED");
        continue;
      }
      if (isSchedule(binding)) {
        await this.fireSchedule(store, row, binding);
      } else {
        await this.poll(store, row, binding);
      }
    }
    await this.retryOneEnable();
  }

  // One fire per due row, however overdue; the next slot is computed from
  // now, so a restart never replays the slots it slept through.
  private async fireSchedule(
    store: WorkflowRunStore,
    row: TriggerStateRow,
    binding: ScheduleTriggerBinding,
  ): Promise<void> {
    const now = this.now();
    try {
      const schedule = parseScheduleConfig(binding.config);
      const scheduledFor = row.next_poll_at ? new Date(row.next_poll_at) : now;
      const nextAt = rescheduleAfterFire(schedule, scheduledFor, now);
      await store.recordPollSuccess(
        row.workflow_id,
        "{}",
        now.toISOString(),
        nextAt.toISOString(),
      );
      this.options.fire(
        binding.workflowId,
        schedulePayload(schedule, scheduledFor, now),
        SCHEDULE_TRIGGER_KIND,
      );
    } catch (error) {
      // Only a config that stopped parsing gets here; stop until it is edited.
      const message = error instanceof Error ? error.message : String(error);
      this.enabledOk.delete(binding.workflowId);
      await store.setTriggerStatus(row.workflow_id, "ERROR", message);
      logger.error(
        `Schedule fire failed for workflow ${row.workflow_id}: ${message}`,
      );
    }
  }

  private async poll(
    store: WorkflowRunStore,
    row: TriggerStateRow,
    binding: PieceTriggerBinding,
  ): Promise<void> {
    const now = this.now();
    const previous = parseStoreState(row);
    try {
      const result = await this.hook(binding, "run", previous);
      if (!Array.isArray(result.output)) {
        throw new Error(
          `Trigger run returned ${typeof result.output}, expected an array`,
        );
      }
      await store.recordPollSuccess(
        row.workflow_id,
        sanitizeStoreState(row.workflow_id, result.storeState, previous, now),
        now.toISOString(),
        new Date(now.getTime() + row.interval_ms).toISOString(),
      );
      for (const item of result.output) {
        await this.fireItem(store, binding, item, now);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failures = row.consecutive_failures + 1;
      const backoff = backoffMs(row.interval_ms, failures);
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
