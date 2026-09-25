// The schedule trigger's form: pick how often in plain terms; raw cron is
// there for anything the presets can't express.
import { useId, useState } from "react";
import {
  FieldError,
  FieldLabel,
  Hint,
  Segmented,
  Select,
  Switch,
  textInputClass,
} from "../../shared/controls.js";
import {
  configFromDraft,
  draftFromConfig,
  switchKind,
  timezoneOf,
  type IntervalUnit,
  type ScheduleDraft,
  type ScheduleKind,
} from "./schedule-draft.js";
import { describeCron, describeSchedule } from "./trigger-text.js";

const KINDS: { value: ScheduleKind; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "interval", label: "Interval" },
  { value: "custom", label: "Custom" },
];

// Monday first; values are cron weekdays.
const DAYS = [
  { value: 1, label: "Mon", name: "Monday" },
  { value: 2, label: "Tue", name: "Tuesday" },
  { value: 3, label: "Wed", name: "Wednesday" },
  { value: 4, label: "Thu", name: "Thursday" },
  { value: 5, label: "Fri", name: "Friday" },
  { value: 6, label: "Sat", name: "Saturday" },
  { value: 0, label: "Sun", name: "Sunday" },
];

const UNITS: { value: IntervalUnit; label: string }[] = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

function timezones(): string[] {
  try {
    return [
      "UTC",
      ...Intl.supportedValuesOf("timeZone").filter((z) => z !== "UTC"),
    ];
  } catch {
    return ["UTC"];
  }
}

const TIMEZONES = timezones();

function TimeField(props: { time: string; onChange: (time: string) => void }) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} label="At" />
      <input
        id={id}
        type="time"
        className={`${textInputClass} w-32 tabular-nums`}
        value={props.time}
        onChange={(event) => {
          if (event.target.value) props.onChange(event.target.value);
        }}
      />
    </div>
  );
}

export function ScheduleBuilder(props: {
  config: unknown;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const everyId = useId();
  const cronId = useId();
  const parsed = draftFromConfig(props.config);
  const timezone = timezoneOf(props.config);
  // Custom stays open while its cron is typed, even when it spells a preset.
  const [customPinned, setCustomPinned] = useState(parsed.kind === "custom");
  const draft: ScheduleDraft =
    customPinned && parsed.kind !== "custom"
      ? switchKind(parsed, "custom")
      : parsed;
  const commit = (next: ScheduleDraft, zone = timezone) =>
    props.onChange(configFromDraft(next, zone));
  const cronInvalid =
    draft.kind === "custom" && draft.cron.trim().split(/\s+/).length !== 5;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <FieldLabel label="Repeats" />
        <Segmented
          value={draft.kind}
          options={KINDS}
          onChange={(value) => {
            const kind = value as ScheduleKind;
            setCustomPinned(kind === "custom");
            commit(switchKind(draft, kind));
          }}
        />
      </div>

      {draft.kind === "daily" ? (
        <>
          <TimeField
            time={draft.time}
            onChange={(time) => commit({ ...draft, time })}
          />
          <Switch
            checked={draft.weekdaysOnly}
            onChange={(weekdaysOnly) => commit({ ...draft, weekdaysOnly })}
            label="Weekdays only"
            description="Skip Saturdays and Sundays."
          />
        </>
      ) : null}

      {draft.kind === "weekly" ? (
        <>
          <div>
            <FieldLabel label="On" />
            <div role="group" aria-label="Days" className="flex gap-1">
              {DAYS.map((day) => {
                const on = draft.days.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={on}
                    aria-label={day.name}
                    className={`h-8 flex-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                      on
                        ? "bg-primary text-primary-foreground"
                        : "border border-solid border-foreground/15 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    onClick={() => {
                      const days = on
                        ? draft.days.filter((value) => value !== day.value)
                        : [...draft.days, day.value];
                      // At least one day, or the schedule would never fire.
                      if (days.length > 0) commit({ ...draft, days });
                    }}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
          <TimeField
            time={draft.time}
            onChange={(time) => commit({ ...draft, time })}
          />
        </>
      ) : null}

      {draft.kind === "interval" ? (
        <div>
          <FieldLabel htmlFor={everyId} label="Every" />
          <div className="flex items-center gap-2">
            <input
              id={everyId}
              type="number"
              min={1}
              className={`${textInputClass} w-24 tabular-nums`}
              value={draft.every}
              onChange={(event) => {
                const every = Number(event.target.value);
                if (Number.isFinite(every) && every >= 1)
                  commit({ ...draft, every });
              }}
            />
            <div className="w-32">
              <Select
                value={draft.unit}
                options={UNITS}
                onChange={(unit) =>
                  commit({ ...draft, unit: unit as IntervalUnit })
                }
              />
            </div>
          </div>
          <Hint text="Counted from when the workflow is enabled." />
        </div>
      ) : null}

      {draft.kind === "custom" ? (
        <div>
          <FieldLabel htmlFor={cronId} label="Cron expression" />
          <input
            id={cronId}
            className={`${textInputClass} font-mono`}
            value={draft.cron}
            spellCheck={false}
            placeholder="0 9 * * 1-5"
            onChange={(event) =>
              commit({ kind: "custom", cron: event.target.value })
            }
          />
          {cronInvalid ? (
            <FieldError>
              Five fields: minute, hour, day of month, month, weekday.
            </FieldError>
          ) : (
            <Hint
              text={
                describeCron(draft.cron) ??
                "Minute, hour, day of month, month, weekday."
              }
            />
          )}
        </div>
      ) : null}

      <div>
        <FieldLabel label="Timezone" />
        <Select
          value={timezone}
          options={TIMEZONES.map((zone) => ({
            value: zone,
            label: zone.replace(/_/g, " "),
          }))}
          onChange={(zone) => commit(draft, zone)}
        />
      </div>

      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Runs{" "}
        <span className="font-medium text-foreground">
          {describeSchedule(props.config).replace(/^\w/, (c) =>
            c.toLowerCase(),
          )}
        </span>
      </p>
    </div>
  );
}
