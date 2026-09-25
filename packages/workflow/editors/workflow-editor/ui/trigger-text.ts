// Plain-language descriptions of when a workflow starts: "Every day at
// 08:00 UTC" rather than "0 8 * * *". Unknown shapes fall back to the raw text.
import { blockMeta } from "./block-meta.js";
import { intervalOf } from "./schedule-draft.js";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const UNIT_LABEL: Record<string, [string, string]> = {
  minutes: ["minute", "minutes"],
  hours: ["hour", "hours"],
  days: ["day", "days"],
};

function isInt(field: string): boolean {
  return /^\d+$/.test(field);
}

function clock(hour: string, minute: string): string {
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function dayList(field: string): string | undefined {
  if (field === "1-5") return "on weekdays";
  if (field === "0,6" || field === "6,0") return "at weekends";
  const days = field.split(",");
  if (!days.every((day) => isInt(day) && Number(day) <= 7)) return undefined;
  const names = days.map((day) => WEEKDAYS[Number(day) % 7]);
  if (names.length === 1) return `every ${names[0]}`;
  return `on ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Describes a five-field cron expression, or returns undefined. */
export function describeCron(cron: string): string | undefined {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return undefined;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (month !== "*") return undefined;

  const everyMinutes = /^\*\/(\d+)$/.exec(minute);
  if (everyMinutes && hour === "*" && dayOfMonth === "*" && dayOfWeek === "*") {
    const n = Number(everyMinutes[1]);
    return n === 1 ? "Every minute" : `Every ${n} minutes`;
  }
  if (minute === "*" && hour === "*" && dayOfMonth === "*" && dayOfWeek === "*")
    return "Every minute";
  if (isInt(minute) && hour === "*" && dayOfMonth === "*" && dayOfWeek === "*")
    return minute === "0"
      ? "Every hour, on the hour"
      : `Every hour at ${minute.padStart(2, "0")} past`;

  const everyHours = /^\*\/(\d+)$/.exec(hour);
  if (isInt(minute) && everyHours && dayOfMonth === "*" && dayOfWeek === "*") {
    return `Every ${everyHours[1]} hours`;
  }
  if (!isInt(minute) || !isInt(hour)) return undefined;
  const at = clock(hour, minute);

  if (dayOfMonth === "*" && dayOfWeek === "*") return `Every day at ${at}`;
  if (dayOfMonth === "*") {
    const days = dayList(dayOfWeek);
    return days
      ? `${days.charAt(0).toUpperCase()}${days.slice(1)} at ${at}`
      : undefined;
  }
  if (isInt(dayOfMonth) && dayOfWeek === "*") {
    return `Every month on day ${dayOfMonth} at ${at}`;
  }
  return undefined;
}

export function describeSchedule(config: unknown): string {
  const record = (config ?? {}) as Record<string, unknown>;
  const zone =
    typeof record.timezone === "string" && record.timezone
      ? record.timezone
      : "UTC";
  const interval =
    record.mode === "interval" ||
    (!record.cron &&
      (record.every !== undefined || record.everyMs !== undefined));
  if (interval) {
    const cadence = intervalOf(record);
    if (!cadence) return "On a fixed interval";
    const unit = UNIT_LABEL[cadence.unit];
    return cadence.every === 1
      ? `Every ${unit[0]}`
      : `Every ${cadence.every} ${unit[1]}`;
  }
  const cron = typeof record.cron === "string" ? record.cron : "";
  if (!cron) return "On a schedule";
  const described = describeCron(cron);
  return described ? `${described} ${zone}` : `On schedule ${cron}`;
}

/** When a workflow starts, from its trigger. */
export function describeTrigger(
  trigger: { blockType: string; config: unknown } | null | undefined,
): string {
  if (!trigger) return "Never starts: no trigger";
  switch (trigger.blockType) {
    case "core#manual":
      return "Manual";
    case "core#webhook":
      return "When its webhook is called";
    case "core#schedule":
      return describeSchedule(trigger.config);
    default: {
      const meta = blockMeta(trigger.blockType);
      const piece = meta.subtitle.replace(/ · Trigger$/, "");
      return `${meta.displayName} in ${piece}`;
    }
  }
}
