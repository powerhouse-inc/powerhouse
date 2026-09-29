// The core piece's schedule trigger config, read the same way by the editor
// and the runtime. The runtime also runs the cron through croner before arming it.

export const DEFAULT_TIMEZONE = "UTC";

export const SCHEDULE_UNIT_MS = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
} as const;

export type ScheduleUnit = keyof typeof SCHEDULE_UNIT_MS;

export const SCHEDULE_MODES = ["cron", "interval"] as const;

export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

export type ScheduleConfig =
  | { mode: "cron"; cron: string; timezone: string }
  | {
      mode: "interval";
      every: number;
      unit: ScheduleUnit;
      everyMs: number;
      timezone: string;
    };

export class ScheduleConfigError extends Error {
  constructor(message: string) {
    super(`Schedule: ${message}`);
    this.name = "ScheduleConfigError";
  }
}

// One cron field: digits, names, ranges, steps and lists; croner checks values.
const CRON_FIELD =
  /^[\d*?A-Za-z]+(?:[-/][\dA-Za-z]+)*(?:,[\d*?A-Za-z]+(?:[-/][\dA-Za-z]+)*)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Intl is the authority on IANA names, in the browser and in Node alike.
function parseTimezone(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_TIMEZONE;
  }
  if (typeof value !== "string") {
    throw new ScheduleConfigError('"timezone" must be an IANA name');
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new ScheduleConfigError(
      `unknown timezone "${value}" (use an IANA name such as Europe/Lisbon)`,
    );
  }
  return value;
}

// Exactly five fields: minute hour day month weekday.
export function parseCronText(cron: unknown): string {
  if (typeof cron !== "string" || cron.trim() === "") {
    throw new ScheduleConfigError('"cron" is required in cron mode');
  }
  const pattern = cron.trim().replace(/\s+/g, " ");
  const fields = pattern.split(" ");
  if (fields.length !== 5) {
    throw new ScheduleConfigError(
      `cron "${pattern}" must have exactly five fields (minute hour day month weekday)`,
    );
  }
  const bad = fields.find((field) => !CRON_FIELD.test(field));
  if (bad !== undefined) {
    throw new ScheduleConfigError(
      `cron "${pattern}" has an invalid field "${bad}"`,
    );
  }
  return pattern;
}

function parseInterval(record: Record<string, unknown>) {
  const { every, unit } = record;
  if (typeof every !== "number" || !Number.isInteger(every) || every < 1) {
    throw new ScheduleConfigError(
      '"every" must be a whole number of at least 1 in interval mode',
    );
  }
  if (typeof unit !== "string" || !Object.hasOwn(SCHEDULE_UNIT_MS, unit)) {
    throw new ScheduleConfigError(
      `"unit" must be one of ${Object.keys(SCHEDULE_UNIT_MS).join(", ")}`,
    );
  }
  const key = unit as ScheduleUnit;
  return { every, unit: key, everyMs: every * SCHEDULE_UNIT_MS[key] };
}

// { mode, cron | every + unit, timezone? }; `mode` is required.
export function parseScheduleConfig(config: unknown): ScheduleConfig {
  if (!isRecord(config)) {
    throw new ScheduleConfigError("the config must be an object");
  }
  const timezone = parseTimezone(config.timezone);
  if (config.mode === "cron") {
    return { mode: "cron", cron: parseCronText(config.cron), timezone };
  }
  if (config.mode === "interval") {
    return { mode: "interval", ...parseInterval(config), timezone };
  }
  throw new ScheduleConfigError(
    config.mode === undefined
      ? '"mode" is required ("cron" or "interval")'
      : `"mode" must be "cron" or "interval", not ${JSON.stringify(config.mode)}`,
  );
}

// The problem with a config, or undefined when it parses.
export function scheduleConfigIssue(config: unknown): string | undefined {
  try {
    parseScheduleConfig(config);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
