// The schedule trigger's config as the builder edits it: daily, weekly, a
// fixed interval, or a raw cron for anything the presets can't say.

import {
  DEFAULT_TIMEZONE,
  parseScheduleConfig,
  type ScheduleUnit,
} from "@powerhousedao/pieces-framework/workflow";

export type IntervalUnit = ScheduleUnit;

export type ScheduleDraft =
  | { kind: "daily"; time: string; weekdaysOnly: boolean }
  | { kind: "weekly"; time: string; days: number[] }
  | { kind: "interval"; every: number; unit: IntervalUnit }
  | { kind: "custom"; cron: string };

export type ScheduleKind = ScheduleDraft["kind"];

export const DEFAULT_TIME = "09:00";
export { DEFAULT_TIMEZONE };

function isInt(field: string): boolean {
  return /^\d+$/.test(field);
}

function toTime(hour: string, minute: string): string {
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function fromTime(time: string): { hour: number; minute: number } {
  const [hour = "9", minute = "0"] = time.split(":");
  return { hour: Number(hour), minute: Number(minute) };
}

function cronDraft(cron: string): ScheduleDraft {
  if (!cron) return { kind: "daily", time: DEFAULT_TIME, weekdaysOnly: false };
  const fields = cron.split(/\s+/);
  if (fields.length !== 5) return { kind: "custom", cron };
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (!isInt(minute) || !isInt(hour) || dayOfMonth !== "*" || month !== "*") {
    return { kind: "custom", cron };
  }
  const time = toTime(hour, minute);
  if (dayOfWeek === "*") return { kind: "daily", time, weekdaysOnly: false };
  if (dayOfWeek === "1-5") return { kind: "daily", time, weekdaysOnly: true };
  const days = dayOfWeek.split(",");
  if (days.every((day) => isInt(day) && Number(day) <= 7)) {
    const unique = [...new Set(days.map((day) => Number(day) % 7))];
    return { kind: "weekly", time, days: unique.sort((a, b) => a - b) };
  }
  return { kind: "custom", cron };
}

// Reads a stored config back into the builder's terms, by its `mode`.
export function draftFromConfig(config: unknown): ScheduleDraft {
  try {
    const schedule = parseScheduleConfig(config);
    return schedule.mode === "interval"
      ? { kind: "interval", every: schedule.every, unit: schedule.unit }
      : cronDraft(schedule.cron);
  } catch {
    // Not valid yet: the builder still opens on the mode it names.
  }
  const record = (config ?? {}) as Record<string, unknown>;
  if (record.mode === "interval") {
    return { kind: "interval", every: 15, unit: "minutes" };
  }
  return cronDraft(typeof record.cron === "string" ? record.cron.trim() : "");
}

/** The cron a draft stands for; undefined for an interval. */
export function cronFromDraft(draft: ScheduleDraft): string | undefined {
  switch (draft.kind) {
    case "daily": {
      const { hour, minute } = fromTime(draft.time);
      return `${minute} ${hour} * * ${draft.weekdaysOnly ? "1-5" : "*"}`;
    }
    case "weekly": {
      const { hour, minute } = fromTime(draft.time);
      const days = draft.days.length > 0 ? draft.days.join(",") : "1";
      return `${minute} ${hour} * * ${days}`;
    }
    case "custom":
      return draft.cron;
    case "interval":
      return undefined;
  }
}

/** The config the runtime reads; UTC is the default, so it isn't stored. */
export function configFromDraft(
  draft: ScheduleDraft,
  timezone: string,
): Record<string, unknown> {
  const zone =
    timezone && timezone !== DEFAULT_TIMEZONE ? { timezone } : undefined;
  if (draft.kind === "interval") {
    return { mode: "interval", every: draft.every, unit: draft.unit, ...zone };
  }
  return { mode: "cron", cron: cronFromDraft(draft), ...zone };
}

/** Switches kind, keeping whatever carries over (the time, mostly). */
export function switchKind(
  draft: ScheduleDraft,
  kind: ScheduleKind,
): ScheduleDraft {
  if (draft.kind === kind) return draft;
  const time = "time" in draft ? draft.time : DEFAULT_TIME;
  switch (kind) {
    case "daily":
      return { kind, time, weekdaysOnly: false };
    case "weekly":
      return { kind, time, days: [1] };
    case "interval":
      return { kind, every: 15, unit: "minutes" };
    case "custom":
      return { kind, cron: cronFromDraft(draft) ?? "0 9 * * *" };
  }
}

export function timezoneOf(config: unknown): string {
  const zone = (config as { timezone?: unknown } | null)?.timezone;
  return typeof zone === "string" && zone ? zone : DEFAULT_TIMEZONE;
}
