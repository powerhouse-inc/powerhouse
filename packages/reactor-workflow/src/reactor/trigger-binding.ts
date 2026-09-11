// What the runtime hands the supervisor for one workflow, plus the pure
// helpers over it. Split out so drivers need not import the supervisor.
import type { RecordedSchedule } from "@powerhousedao/reactor-connectors";
import { childLogger } from "document-model";
import { createHash } from "node:crypto";
import { cronIntervalMs, MIN_SCHEDULE_INTERVAL_MS } from "./schedule.js";
import type { SCHEDULE_BLOCK } from "./schedule.js";
import type { TriggerStateRow } from "./store.js";

const logger = childLogger(["workflow", "trigger-binding"]);

export const MIN_INTERVAL_MS = MIN_SCHEDULE_INTERVAL_MS;

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
  // How the piece expects to be fed. WEBHOOK-strategy triggers are never
  // polled: their run hook needs the request, and polling would call it blind.
  delivery?: "poll" | "webhook";
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

// Which driver owns a binding: the one place the union is discriminated.
export type TriggerDeliveryKind = "schedule" | "piece-poll" | "piece-webhook";

export function deliveryKindFor(binding: TriggerBinding): TriggerDeliveryKind {
  if (binding.kind === "schedule") return "schedule";
  return binding.delivery === "webhook" ? "piece-webhook" : "piece-poll";
}

// Narrowing assertions stating each driver's precondition. Reaching one means
// the binding was routed to the wrong driver, which is a bug, not input.
export function asPiece(binding: TriggerBinding): PieceTriggerBinding {
  if (binding.kind === "schedule") {
    throw new Error(`Expected a piece binding, got ${binding.blockType}`);
  }
  return binding;
}

export function asSchedule(binding: TriggerBinding): ScheduleTriggerBinding {
  if (binding.kind !== "schedule") {
    throw new Error(`Expected a schedule binding, got ${binding.blockType}`);
  }
  return binding;
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

// STALE: store_state is vestigial — the migration in store.ts blanks it and
// the supervisor only ever writes "{}". This always returns {} on a live row.

// Only trigger-drivers.ts calls it, and only tests call that. Wiring that path
// into service.ts without converting it to piece_store restarts every cursor.
export function parseStoreState(row: TriggerStateRow): Record<string, unknown> {
  try {
    return JSON.parse(row.store_state) as Record<string, unknown>;
  } catch {
    return {};
  }
}
