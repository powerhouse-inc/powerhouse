// One driver per way a trigger gets its input: a cron slot, a poll of the
// piece, or an inbound request. The supervisor owns the row; these own the fire.
import { extractDedupeKey } from "@powerhousedao/reactor-connectors";
import { childLogger } from "document-model";
import {
  MIN_SCHEDULE_INTERVAL_MS,
  nextFireAt,
  parseScheduleConfig,
  rescheduleAfterFire,
  schedulePayload,
  SCHEDULE_BLOCK,
} from "./schedule.js";
import type { TriggerStateRow, WorkflowRunStore } from "./store.js";
import {
  asPiece,
  asSchedule,
  parseStoreState,
  pollIntervalFor,
  SCHEDULE_TRIGGER_KIND,
  type PieceTriggerBinding,
  type TriggerBinding,
} from "./trigger-binding.js";
import type {
  EnableContext,
  EnabledState,
  FailedState,
  TriggerDriver,
  TriggerDriverContext,
} from "./trigger-driver.js";

const logger = childLogger(["workflow", "trigger-drivers"]);

const MAX_BACKOFF_MS = 30 * 60_000;
const DEDUPE_TTL_MS = 30_000;

// One workflow run per output item; _dedupe_key suppresses 30s repeats.
async function firePieceItem(
  store: WorkflowRunStore,
  binding: PieceTriggerBinding,
  item: unknown,
  now: Date,
  ctx: TriggerDriverContext,
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
  ctx.fire(binding.workflowId, item, `piece:${binding.blockType}`);
}

// onEnable, with the cursor carried over only for an unchanged re-register.

// STALE: this still seeds and returns the flat storeState blob. The supervisor
// serves ctx.store from piece_store instead; see parseStoreState's note.
async function armPiece(
  binding: PieceTriggerBinding,
  context: EnableContext,
  ctx: TriggerDriverContext,
) {
  const seed =
    context.existing && context.isRepublish
      ? parseStoreState(context.existing)
      : {};
  const result = await ctx.runHook(binding, "onEnable", seed, {
    isRepublish: context.isRepublish,
  });
  return {
    storeState: JSON.stringify(result.storeState ?? {}),
    schedules: result.schedules,
  };
}

// Both piece kinds record the same ERROR row: the cursor is kept so a later
// re-enable still republishes onto it.
function pieceFailedState(
  binding: TriggerBinding,
  context: EnableContext,
  ctx: TriggerDriverContext,
): FailedState {
  return {
    storeState: context.existing?.store_state ?? "{}",
    intervalMs: pollIntervalFor(
      asPiece(binding),
      undefined,
      ctx.defaultIntervalMs,
    ),
    lastPollAt: null,
  };
}

// A row whose block_type belongs to another kind is stale: the workflow was
// retyped, and the piece hook would be given a config it never saw.
async function releasePiece(
  binding: TriggerBinding,
  row: TriggerStateRow,
  ctx: TriggerDriverContext,
): Promise<void> {
  if (row.block_type === SCHEDULE_BLOCK) return;
  await ctx.runHook(asPiece(binding), "onDisable", parseStoreState(row));
}

// Runs the piece's run hook and fires an item per element it returns. Shared
// because a delivery and a poll differ only in what feeds the hook.
async function runAndFire(
  binding: PieceTriggerBinding,
  row: TriggerStateRow,
  ctx: TriggerDriverContext,
  options: { payload?: unknown; nextPollAt: string | null },
): Promise<number> {
  const now = ctx.now();
  const result = await ctx.runHook(
    binding,
    "run",
    parseStoreState(row),
    options.payload === undefined ? {} : { payload: options.payload },
  );
  if (!Array.isArray(result.output)) {
    throw new Error(
      `Trigger run returned ${typeof result.output}, expected an array`,
    );
  }
  await ctx.store.recordPollSuccess(
    row.workflow_id,
    JSON.stringify(result.storeState ?? {}),
    now.toISOString(),
    options.nextPollAt,
  );
  for (const item of result.output) {
    await firePieceItem(ctx.store, binding, item, now, ctx);
  }
  return result.output.length;
}

// core#schedule: a cron slot or a fixed interval, with no piece involved.
export const scheduleDriver: TriggerDriver = {
  kind: "schedule",
  scheduled: true,

  // arm is async on purpose: a driver that threw synchronously would escape
  // the supervisor's promise-based failure handling.

  // An unchanged, still-ENABLED row keeps its next fire time, which carries a
  // schedule across a restart; anything else rebases on now.
  async arm(binding, context, ctx): Promise<EnabledState> {
    const schedule = parseScheduleConfig(asSchedule(binding).config);
    const carried =
      context.isRepublish && context.existing?.status === "ENABLED"
        ? context.existing.next_poll_at
        : null;
    const nextAt = carried
      ? new Date(carried)
      : nextFireAt(schedule, ctx.now());
    return await Promise.resolve({
      storeState: "{}",
      intervalMs:
        schedule.mode === "interval"
          ? schedule.everyMs
          : MIN_SCHEDULE_INTERVAL_MS,
      nextPollAt: nextAt.toISOString(),
      lastPollAt: context.existing?.last_poll_at ?? null,
      cadence: `next fire ${nextAt.toISOString()}${carried ? " (carried over)" : ""}`,
    });
  },

  failedState(_binding, context): FailedState {
    return {
      storeState: "{}",
      intervalMs: MIN_SCHEDULE_INTERVAL_MS,
      lastPollAt: context.existing?.last_poll_at ?? null,
    };
  },

  // One fire per due row, however overdue; the next slot is computed from
  // now, so a restart never replays the slots it slept through.
  async onDue(binding, row, ctx): Promise<void> {
    const now = ctx.now();
    try {
      const schedule = parseScheduleConfig(asSchedule(binding).config);
      const scheduledFor = row.next_poll_at ? new Date(row.next_poll_at) : now;
      const nextAt = rescheduleAfterFire(schedule, scheduledFor, now);
      await ctx.store.recordPollSuccess(
        row.workflow_id,
        "{}",
        now.toISOString(),
        nextAt.toISOString(),
      );
      ctx.fire(
        binding.workflowId,
        schedulePayload(schedule, scheduledFor, now),
        SCHEDULE_TRIGGER_KIND,
      );
    } catch (error) {
      // Only a config that stopped parsing gets here; stop until it is edited.
      const message = error instanceof Error ? error.message : String(error);
      ctx.markUnhealthy(binding.workflowId);
      await ctx.store.setTriggerStatus(row.workflow_id, "ERROR", message);
      logger.error(
        `Schedule fire failed for workflow ${row.workflow_id}: ${message}`,
      );
    }
  },
};

// A POLLING-strategy piece: the timer calls its run hook on a cadence, and
// the piece's own store carries the cursor between calls.
export const piecePollDriver: TriggerDriver = {
  kind: "piece-poll",
  scheduled: true,

  async arm(binding, context, ctx): Promise<EnabledState> {
    const piece = asPiece(binding);
    const { storeState, schedules } = await armPiece(piece, context, ctx);
    const intervalMs = pollIntervalFor(piece, schedules, ctx.defaultIntervalMs);
    return {
      storeState,
      intervalMs,
      nextPollAt: new Date(ctx.now().getTime() + intervalMs).toISOString(),
      lastPollAt: null,
      cadence: `every ${intervalMs}ms`,
    };
  },

  failedState: pieceFailedState,
  release: releasePiece,

  async onDue(binding, row, ctx): Promise<void> {
    const piece = asPiece(binding);
    const now = ctx.now();
    try {
      await runAndFire(piece, row, ctx, {
        nextPollAt: new Date(now.getTime() + row.interval_ms).toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failures = row.consecutive_failures + 1;
      const backoff = Math.min(row.interval_ms * 2 ** failures, MAX_BACKOFF_MS);
      await ctx.store.recordPollFailure(
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
  },
};

// A WEBHOOK-strategy piece: onEnable registers our endpoint with the provider,
// and each inbound request is fed to the same run hook a poll would have called.
export const pieceWebhookDriver: TriggerDriver & {
  deliver(
    binding: PieceTriggerBinding,
    payload: unknown,
    ctx: TriggerDriverContext,
  ): Promise<number>;
} = {
  kind: "piece-webhook",
  // Never scheduled: the run hook needs a request, so a poll would call it
  // blind. interval_ms 0 and a null next_poll_at say so in the row.
  scheduled: false,

  async arm(binding, context, ctx): Promise<EnabledState> {
    const { storeState } = await armPiece(asPiece(binding), context, ctx);
    return {
      storeState,
      intervalMs: 0,
      nextPollAt: null,
      lastPollAt: null,
      cadence: "webhook",
    };
  },

  failedState: pieceFailedState,
  release: releasePiece,

  async deliver(binding, payload, ctx): Promise<number> {
    const row = await ctx.store.getTriggerState(binding.workflowId);
    if (!row || row.status !== "ENABLED") {
      throw new Error(
        `Trigger for workflow ${binding.workflowId} is not enabled`,
      );
    }
    // next_poll_at stays null: a delivery records a success without becoming
    // a poll.
    return runAndFire(binding, row, ctx, { payload, nextPollAt: null });
  },
};
