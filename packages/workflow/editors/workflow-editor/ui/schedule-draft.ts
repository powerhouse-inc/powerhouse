// The schedule trigger's config as the builder edits it: daily, weekly, a
// fixed interval, or a raw cron for anything the presets can't say.

export type IntervalUnit = "minutes" | "hours" | "days";

export type ScheduleDraft =
  | { kind: "daily"; time: string; weekdaysOnly: boolean }
  | { kind: "weekly"; time: string; days: number[] }
  | { kind: "interval"; every: number; unit: IntervalUnit }
  | { kind: "custom"; cron: string };

export type ScheduleKind = ScheduleDraft["kind"];

export const DEFAULT_TIME = "09:00";
export const DEFAULT_TIMEZONE = "UTC";

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

/** Reads a stored config back into the builder's terms. */
export function draftFromConfig(config: unknown): ScheduleDraft {
  const record = (config ?? {}) as Record<string, unknown>;
  const interval =
    record.mode === "interval" || (!record.cron && record.every !== undefined);
  if (interval) {
    const unit =
      record.unit === "hours" || record.unit === "days"
        ? record.unit
        : "minutes";
    const every = Number(record.every);
    return {
      kind: "interval",
      every: Number.isFinite(every) && every > 0 ? every : 15,
      unit,
    };
  }
  const cron = typeof record.cron === "string" ? record.cron.trim() : "";
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
