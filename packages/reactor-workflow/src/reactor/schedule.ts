// Pure config parsing and next-fire math for the core#schedule trigger: a
// 5-field cron in an IANA timezone, or a fixed interval (min one second).
import { Cron } from "croner";

export const SCHEDULE_BLOCK = "core#schedule";

// The floor the supervisor clamps every poll cadence to, however a workflow
// asked for it. A second, not a minute: a polling trigger here watches
// something the reactor owns, and the cost of a poll is a request the operator
// is already paying for. The cadence a workflow should actually run at is the
// author's call, expressed in its own config; this only refuses nonsense.
export const MIN_SCHEDULE_INTERVAL_MS = 1_000;
export const DEFAULT_TIMEZONE = "UTC";

export const INTERVAL_UNIT_MS = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
} as const;

export type IntervalUnit = keyof typeof INTERVAL_UNIT_MS;

export type ScheduleConfig =
  | { mode: "cron"; cron: string; timezone: string }
  | { mode: "interval"; everyMs: number; timezone: string };

function asRecord(config: unknown): Record<string, unknown> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return config as Record<string, unknown>;
  }
  if (typeof config === "string") {
    try {
      return asRecord(JSON.parse(config));
    } catch {
      return {};
    }
  }
  return {};
}

// Intl is the authority on IANA names; croner defers to it as well.
function parseTimezone(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_TIMEZONE;
  }
  if (typeof value !== "string") {
    throw new Error(`${SCHEDULE_BLOCK}: "timezone" must be an IANA name`);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new Error(
      `${SCHEDULE_BLOCK}: unknown timezone "${value}" (use an IANA name such as Europe/Lisbon)`,
    );
  }
  return value;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

// Exactly five fields: seconds would only mislead under a one-minute floor.
function parseCronPattern(cron: unknown, timezone: string): string {
  if (typeof cron !== "string" || cron.trim() === "") {
    throw new Error(`${SCHEDULE_BLOCK}: "cron" is required in cron mode`);
  }
  const pattern = cron.trim().replace(/\s+/g, " ");
  if (pattern.split(" ").length !== 5) {
    throw new Error(
      `${SCHEDULE_BLOCK}: cron "${pattern}" must have exactly five fields (minute hour day month weekday)`,
    );
  }
  let cronJob: Cron;
  try {
    cronJob = new Cron(pattern, { timezone, legacyMode: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${SCHEDULE_BLOCK}: invalid cron "${pattern}": ${message}`,
      {
        cause: error,
      },
    );
  }
  if (!cronJob.nextRun()) {
    throw new Error(`${SCHEDULE_BLOCK}: cron "${pattern}" never fires`);
  }
  return pattern;
}

// Config: { mode?, cron?, every?, unit?, everyMs?, timezone? }; an omitted
// mode follows whichever of cron / every is present (cron wins).
export function parseScheduleConfig(config: unknown): ScheduleConfig {
  const record = asRecord(config);
  const timezone = parseTimezone(record.timezone);
  const mode =
    record.mode === "cron" || record.mode === "interval"
      ? record.mode
      : record.cron
        ? "cron"
        : record.every !== undefined || record.everyMs !== undefined
          ? "interval"
          : undefined;
  if (!mode) {
    throw new Error(
      `${SCHEDULE_BLOCK}: "mode" must be "cron" or "interval" (or set "cron" / "every")`,
    );
  }
  if (mode === "cron") {
    return { mode, cron: parseCronPattern(record.cron, timezone), timezone };
  }
  return { mode, everyMs: intervalMsFrom(record), timezone };
}

function intervalMsFrom(record: Record<string, unknown>): number {
  const every = toNumber(record.every);
  let everyMs: number | undefined;
  if (every !== undefined) {
    const unit = (record.unit ?? "minutes") as string;
    if (!(unit in INTERVAL_UNIT_MS)) {
      throw new Error(
        `${SCHEDULE_BLOCK}: "unit" must be one of ${Object.keys(INTERVAL_UNIT_MS).join(", ")}`,
      );
    }
    everyMs = every * INTERVAL_UNIT_MS[unit as IntervalUnit];
  } else {
    everyMs = toNumber(record.everyMs);
  }
  if (everyMs === undefined) {
    throw new Error(
      `${SCHEDULE_BLOCK}: "every" (with "unit") or "everyMs" is required in interval mode`,
    );
  }
  if (!Number.isFinite(everyMs) || everyMs <= 0) {
    throw new Error(
      `${SCHEDULE_BLOCK}: the interval must be a positive number`,
    );
  }
  if (everyMs < MIN_SCHEDULE_INTERVAL_MS) {
    throw new Error(
      `${SCHEDULE_BLOCK}: the interval must be at least ${MIN_SCHEDULE_INTERVAL_MS / 1000}s`,
    );
  }
  return Math.round(everyMs);
}

// Strictly after `from`. A cron slot erased by a DST jump resolves to the
// first valid instant after it, so it still fires once.
export function nextFireAt(schedule: ScheduleConfig, from: Date): Date {
  if (schedule.mode === "interval") {
    return new Date(from.getTime() + schedule.everyMs);
  }
  const next = new Cron(schedule.cron, {
    timezone: schedule.timezone,
    legacyMode: false,
  }).nextRun(from);
  if (!next) {
    throw new Error(`${SCHEDULE_BLOCK}: cron "${schedule.cron}" never fires`);
  }
  return next;
}

// Interval mode keeps its phase while still ahead of `now` (no tick drift);
// an overdue slot fires once and rebases on `now` rather than replaying.
export function rescheduleAfterFire(
  schedule: ScheduleConfig,
  scheduledFor: Date,
  now: Date,
): Date {
  if (schedule.mode === "interval") {
    const onPhase = new Date(scheduledFor.getTime() + schedule.everyMs);
    return onPhase > now ? onPhase : nextFireAt(schedule, now);
  }
  return nextFireAt(schedule, now);
}

export interface SchedulePayload {
  scheduledFor: string;
  firedAt: string;
  timezone: string;
  cron?: string;
  everyMs?: number;
}

export function schedulePayload(
  schedule: ScheduleConfig,
  scheduledFor: Date,
  firedAt: Date,
): SchedulePayload {
  return {
    scheduledFor: scheduledFor.toISOString(),
    firedAt: firedAt.toISOString(),
    timezone: schedule.timezone,
    ...(schedule.mode === "cron"
      ? { cron: schedule.cron }
      : { everyMs: schedule.everyMs }),
  };
}

// Poll cadence implied by a piece's setSchedule cron: the gap between its
// next two runs, floored. Undefined when it is invalid or never repeats.
export function cronIntervalMs(
  cron: string,
  from = new Date(),
): number | undefined {
  try {
    const job = new Cron(cron.trim(), { timezone: "UTC", legacyMode: false });
    const runs = job.nextRuns(2, from);
    if (runs.length < 2) return undefined;
    return Math.max(
      runs[1].getTime() - runs[0].getTime(),
      MIN_SCHEDULE_INTERVAL_MS,
    );
  } catch {
    return undefined;
  }
}
