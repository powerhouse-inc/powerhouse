// Next-fire math for the core schedule trigger. Config parsing is the shared
// parser's; this adds croner's check that the cron is valid and ever fires.
import {
  DEFAULT_TIMEZONE,
  parseScheduleConfig as parseSharedSchedule,
  ScheduleConfigError,
  type ScheduleConfig,
} from "@powerhousedao/pieces-framework/workflow";
import { Cron } from "croner";

export { DEFAULT_TIMEZONE, type ScheduleConfig };

// The floor the supervisor clamps every poll cadence to, however a workflow
// asked for it. A schedule's own floor is a minute, its smallest unit.
export const MIN_SCHEDULE_INTERVAL_MS = 1_000;

export function parseScheduleConfig(config: unknown): ScheduleConfig {
  const schedule = parseSharedSchedule(config);
  if (schedule.mode !== "cron") return schedule;
  let cronJob: Cron;
  try {
    cronJob = new Cron(schedule.cron, {
      timezone: schedule.timezone,
      legacyMode: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ScheduleConfigError(
      `invalid cron "${schedule.cron}": ${message}`,
    );
  }
  if (!cronJob.nextRun()) {
    throw new ScheduleConfigError(`cron "${schedule.cron}" never fires`);
  }
  return schedule;
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
    throw new Error(`Schedule: cron "${schedule.cron}" never fires`);
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
