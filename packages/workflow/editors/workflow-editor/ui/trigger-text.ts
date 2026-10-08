// Plain-language descriptions of when a workflow starts: "Every day at
// 08:00 UTC" rather than "0 8 * * *". Unknown shapes fall back to the raw text.
import { blockKey } from "@powerhousedao/pieces-framework/block-type";
import { blockMeta } from "./block-meta.js";
import {
  MANUAL_TRIGGER,
  REACTOR_PIECE,
  SCHEDULE_TRIGGER,
  WEBHOOK_TRIGGER,
} from "./blocks.js";
import { parseScheduleConfig } from "@powerhousedao/pieces-framework/workflow";

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
  let schedule;
  try {
    schedule = parseScheduleConfig(config);
  } catch {
    return "On a schedule that does not parse";
  }
  if (schedule.mode === "interval") {
    const unit = UNIT_LABEL[schedule.unit];
    return schedule.every === 1
      ? `Every ${unit[0]}`
      : `Every ${schedule.every} ${unit[1]}`;
  }
  const described = describeCron(schedule.cron);
  return described
    ? `${described} ${schedule.timezone}`
    : `On schedule ${schedule.cron}`;
}

// A literal config value; an expression or a blank says nothing to show.
function literal(config: unknown, key: string): string | undefined {
  if (!config || typeof config !== "object") return undefined;
  const value = (config as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && !text.includes("{{") ? text : undefined;
}

// "umh/production-ledger" reads as "Production Ledger".
function documentTypeLabel(documentType: string): string {
  const name = documentType.split("/").pop() ?? documentType;
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// "APPROVE_ORDER" reads as "Approve order".
function actionTypeLabel(actionType: string): string {
  const words = actionType
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean);
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Describes a reactor document trigger by what it filters on. */
export function describeDocumentTrigger(
  triggerName: string,
  config: unknown,
): string | undefined {
  const documentType = literal(config, "documentType");
  const label = documentType ? documentTypeLabel(documentType) : "";
  const subject = label
    ? `${/^[AEIOU]/.test(label) ? "an" : "a"} ${label}`
    : literal(config, "documentId")
      ? "its document"
      : "a document";
  switch (triggerName) {
    case "document-event": {
      const actionType = literal(config, "actionType");
      return actionType
        ? `When ${actionTypeLabel(actionType)} runs on ${subject}`
        : `When ${subject} changes`;
    }
    case "document-created":
      return `When ${subject} is created`;
    case "document-deleted":
      return `When ${subject} is deleted`;
    default:
      return undefined;
  }
}

/** When a workflow starts, from its trigger. */
export function describeTrigger(
  trigger:
    | { pieceName: string; triggerName: string; config: unknown }
    | null
    | undefined,
): string {
  if (!trigger) return "Never starts: no trigger";
  const block = {
    pieceName: trigger.pieceName,
    kind: "trigger" as const,
    name: trigger.triggerName,
  };
  switch (blockKey(block)) {
    case blockKey(MANUAL_TRIGGER):
      return "Manual";
    case blockKey(WEBHOOK_TRIGGER):
      return "When its webhook is called";
    case blockKey(SCHEDULE_TRIGGER):
      return describeSchedule(trigger.config);
    default: {
      if (trigger.pieceName === REACTOR_PIECE) {
        const described = describeDocumentTrigger(
          trigger.triggerName,
          trigger.config,
        );
        if (described) return described;
      }
      const meta = blockMeta(block);
      const piece = meta.subtitle.replace(/ · Trigger$/, "");
      return `${meta.displayName} in ${piece}`;
    }
  }
}
