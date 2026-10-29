// The core manual trigger's `inputs` (Activepieces' web form fields, more
// types), read the same way by the editor's run form and the runtime.

export const MANUAL_INPUT_TYPES = [
  "text",
  "text_area",
  "number",
  "toggle",
  "date",
  "dropdown",
  "json",
] as const;

export type ManualInputType = (typeof MANUAL_INPUT_TYPES)[number];

export interface ManualInput {
  // The payload key.
  name: string;
  displayName: string;
  type: ManualInputType;
  required: boolean;
  description?: string;
  // As authored, text; coerced to the field's type when used.
  defaultValue?: string;
  // Dropdown only: the allowed values and the labels the run form shows.
  options?: ManualOption[];
}

export interface ManualOption {
  label: string;
  value: string;
}

export interface ManualPayloadFieldError {
  field: string;
  message: string;
}

export class ManualPayloadError extends Error {
  readonly fields: ManualPayloadFieldError[];
  constructor(fields: ManualPayloadFieldError[]) {
    super(
      `Manual trigger payload: ${fields
        .map((entry) =>
          entry.field ? `"${entry.field}" ${entry.message}` : entry.message,
        )
        .join("; ")}`,
    );
    this.name = "ManualPayloadError";
    this.fields = fields;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

function defaultText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value as number | boolean);
}

// One option per line as `Label = value` (split on the first " = ") or a bare
// value that is its own label; blanks dropped, a repeated value keeps the first.
export function parseManualOptions(value: unknown): ManualOption[] {
  const entries = Array.isArray(value)
    ? value.map(optionEntry)
    : typeof value === "string"
      ? value.split(/\r?\n/).map(optionLine)
      : [];
  const byValue = new Map<string, ManualOption>();
  for (const entry of entries) {
    if (entry && !byValue.has(entry.value)) byValue.set(entry.value, entry);
  }
  return [...byValue.values()];
}

function optionLine(line: string): ManualOption | undefined {
  const at = line.indexOf(" = ");
  const value = (at < 0 ? line : line.slice(at + 3)).trim();
  if (value === "") return undefined;
  const label = at < 0 ? value : line.slice(0, at).trim();
  return { label: label === "" ? value : label, value };
}

function optionEntry(entry: unknown): ManualOption | undefined {
  if (!isRecord(entry)) return optionLine(String(entry));
  const value = defaultText(entry.value)?.trim();
  if (!value) return undefined;
  return { label: text(entry.label) ?? value, value };
}

// The trigger config's `inputs`; rows without a name or known type are dropped,
// and a later row replaces an earlier one of the same name.
export function parseManualInputs(config: unknown): ManualInput[] {
  const rows = isRecord(config) ? config.inputs : undefined;
  if (!Array.isArray(rows)) return [];
  const byName = new Map<string, ManualInput>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const name = text(row.name);
    const type = row.type as ManualInputType;
    if (!name || !MANUAL_INPUT_TYPES.includes(type)) continue;
    const description = text(row.description);
    const defaultValue = defaultText(row.defaultValue);
    byName.delete(name);
    byName.set(name, {
      name,
      displayName: text(row.displayName) ?? name,
      type,
      required: row.required === true,
      ...(description ? { description } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(type === "dropdown"
        ? { options: parseManualOptions(row.options) }
        : {}),
    });
  }
  return [...byName.values()];
}

// Calendar date or date-time, ISO 8601.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

type Coerced = { value: unknown } | { error: string };

// One value as the field's type, or why it isn't one.
export function coerceManualValue(input: ManualInput, raw: unknown): Coerced {
  switch (input.type) {
    case "text":
    case "text_area":
      if (typeof raw === "string") return { value: raw };
      if (typeof raw === "number" || typeof raw === "boolean") {
        return { value: String(raw) };
      }
      return { error: "must be text" };
    case "number": {
      if (typeof raw === "number" && Number.isFinite(raw))
        return { value: raw };
      const parsed =
        typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      return Number.isFinite(parsed)
        ? { value: parsed }
        : { error: "must be a number" };
    }
    case "toggle":
      if (typeof raw === "boolean") return { value: raw };
      if (typeof raw === "string" && /^(true|false)$/i.test(raw.trim())) {
        return { value: raw.trim().toLowerCase() === "true" };
      }
      return { error: "must be true or false" };
    case "date": {
      const value = typeof raw === "string" ? raw.trim() : "";
      const time = ISO_DATE.test(value) ? Date.parse(value) : NaN;
      return Number.isNaN(time)
        ? { error: "must be an ISO 8601 date" }
        : { value: new Date(time).toISOString() };
    }
    case "dropdown": {
      const value =
        typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
      const values = (input.options ?? []).map((option) => option.value);
      if (values.length === 0 ? value !== "" : values.includes(value)) {
        return { value };
      }
      return values.length > 0
        ? { error: `must be one of ${values.map((v) => `"${v}"`).join(", ")}` }
        : { error: "must be text" };
    }
    case "json":
      return { value: raw };
  }
}

// An authored default as the field's type; JSON text is parsed when it parses.
export function manualDefault(input: ManualInput): unknown {
  if (input.defaultValue === undefined) return undefined;
  if (input.type === "json") {
    try {
      return JSON.parse(input.defaultValue) as unknown;
    } catch {
      return input.defaultValue;
    }
  }
  if (input.type === "dropdown") {
    // A value, or failing that an option's label.
    const options = input.options ?? [];
    const match =
      options.find((option) => option.value === input.defaultValue) ??
      options.find((option) => option.label === input.defaultValue);
    if (match) return match.value;
  }
  const coerced = coerceManualValue(input, input.defaultValue);
  return "value" in coerced ? coerced.value : undefined;
}

const isMissing = (value: unknown) =>
  value === undefined || value === null || value === "";

// The payload with each declared field coerced and defaults filled in; keys no
// field declares pass through. Throws ManualPayloadError.
export function coerceManualPayload(
  inputs: readonly ManualInput[],
  payload: unknown,
): Record<string, unknown> {
  if (payload !== undefined && payload !== null && !isRecord(payload)) {
    throw new ManualPayloadError([
      { field: "", message: "must be a JSON object" },
    ]);
  }
  const next: Record<string, unknown> = { ...payload };
  const errors: ManualPayloadFieldError[] = [];
  for (const input of inputs) {
    let raw = next[input.name];
    if (isMissing(raw)) raw = manualDefault(input);
    if (isMissing(raw)) {
      delete next[input.name];
      if (input.required) {
        errors.push({ field: input.name, message: "is required" });
      }
      continue;
    }
    const coerced = coerceManualValue(input, raw);
    if ("error" in coerced) {
      errors.push({ field: input.name, message: coerced.error });
    } else next[input.name] = coerced.value;
  }
  if (errors.length > 0) throw new ManualPayloadError(errors);
  return next;
}

const TYPE_NAMES: Record<ManualInputType, string> = {
  text: "String",
  text_area: "String",
  number: "Float",
  toggle: "Boolean",
  date: "DateTime",
  dropdown: "String",
  json: "JSON",
};

// The GraphQL-style type the expression picker shows for a field.
export function manualInputTypeName(input: ManualInput): string {
  const base = TYPE_NAMES[input.type];
  return input.required ? `${base}!` : base;
}
