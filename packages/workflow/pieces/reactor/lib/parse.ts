// Config parsing shared by the document actions. "exact" takes an id or JSON as
// given; "extract" digs them out of model output and says what it read from.

export interface ActionInputConfig {
  type: string;
  input?: unknown;
  scope?: string;
}

export interface DispatchPayload {
  // Present when the payload object named its own target document.
  documentId?: string;
  actions: ActionInputConfig[];
}

export interface CreatePayload {
  documentType?: string;
  name?: string;
  actions?: unknown;
}

export type ParseMode = "exact" | "extract";

export const PARSE_MODES: { label: string; value: ParseMode }[] = [
  { label: "Exact", value: "exact" },
  { label: "Extract from AI output", value: "extract" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function unfence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

// Every top-level {...} or [...] in a string, in order; scanned so a brace
// inside a string literal is not read as one.
function jsonSpans(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      if (depth === 0) start = index;
      depth++;
      continue;
    }
    if (character === "}" || character === "]") {
      if (depth === 0) continue;
      depth--;
      if (depth === 0 && start >= 0) {
        spans.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return spans;
}

// JSON out of model prose: fenced, or the LAST top-level value, since models
// deliberate first and answer last.
export function parseModelJson(text: string): unknown {
  const cleaned = unfence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Not JSON on its own; look for JSON inside it.
  }
  const spans = jsonSpans(cleaned);
  for (let index = spans.length - 1; index >= 0; index--) {
    try {
      return JSON.parse(spans[index]);
    } catch {
      // A span that does not parse is prose that happened to hold a brace.
    }
  }
  throw new SyntaxError("no JSON value found");
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// The first uuid in the text, else the text without quotes.
function extractDocumentId(text: string): string | undefined {
  const uuid = UUID.exec(text);
  if (uuid) return uuid[0];
  return (
    text
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim() || undefined
  );
}

const EXTRACT_HINT =
  'set "Parse" to "Extract from AI output" to read one out of text';

// Reads config values in one mode, recording what "extract" read from.
export class ConfigReader {
  readonly extractedFrom: Record<string, string> = {};

  constructor(
    readonly block: string,
    readonly mode: ParseMode,
  ) {}

  static of(block: string, value: unknown): ConfigReader {
    if (value === undefined || value === null || value === "") {
      return new ConfigReader(block, "exact");
    }
    if (value !== "exact" && value !== "extract") {
      throw new Error(`${block}: "parse" must be "exact" or "extract"`);
    }
    return new ConfigReader(block, value);
  }

  get extract(): boolean {
    return this.mode === "extract";
  }

  // Undefined when unset.
  documentId(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") {
      throw new Error(
        `${this.block}: "${field}" must be a document id; got ${preview(value)}`,
      );
    }
    if (this.extract) {
      const id = extractDocumentId(value);
      if (id !== undefined && id !== value) this.extractedFrom[field] = value;
      return id;
    }
    if (!/^[^\s"'`]+$/.test(value)) {
      throw new Error(
        `${this.block}: "${field}" is not a document id: ${preview(value)}; ${EXTRACT_HINT}`,
      );
    }
    return value;
  }

  // JSON text as a value; anything not text is already one.
  json(value: unknown, field: string): unknown {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      if (!this.extract) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${this.block}: "${field}" is not valid JSON (${reason}); ${EXTRACT_HINT}`,
          { cause: error },
        );
      }
    }
    try {
      const parsed = parseModelJson(value);
      this.extractedFrom[field] = value;
      return parsed;
    } catch {
      throw new Error(`${this.block}: "${field}" holds no JSON value`);
    }
  }

  // The output's `extractedFrom`, present only when something was extracted.
  output(): { extractedFrom?: Record<string, string> } {
    return Object.keys(this.extractedFrom).length
      ? { extractedFrom: this.extractedFrom }
      : {};
  }
}

function actionEntries(
  list: unknown[],
  reader: ConfigReader,
  field: string,
): ActionInputConfig[] {
  return list.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.type !== "string") {
      throw new Error(
        `${reader.block}: ${field}[${index}] needs a string "type"`,
      );
    }
    if (entry.scope !== undefined && typeof entry.scope !== "string") {
      throw new Error(
        `${reader.block}: ${field}[${index}].scope must be a string`,
      );
    }
    return {
      type: entry.type,
      input: entry.input,
      scope: entry.scope,
    };
  });
}

// A list of actions, or {documentId?, actions: [...]}; "extract" also reads a
// lone action object as a list of one.
export function parseDispatchPayload(
  raw: unknown,
  reader: ConfigReader,
  field = "actions",
): DispatchPayload {
  if (raw === undefined || raw === null || raw === "") return { actions: [] };
  const value = reader.json(raw, field);
  if (Array.isArray(value)) {
    return { actions: actionEntries(value, reader, field) };
  }
  if (isRecord(value)) {
    if (Array.isArray(value.actions)) {
      return {
        documentId: reader.documentId(value.documentId, `${field}.documentId`),
        actions: actionEntries(value.actions, reader, field),
      };
    }
    if (reader.extract && typeof value.type === "string") {
      return { actions: actionEntries([value], reader, field) };
    }
  }
  throw new Error(
    `${reader.block}: "${field}" must be a list of actions or an object with an "actions" list; got ${preview(value)}`,
  );
}

export function parseActions(
  raw: unknown,
  reader: ConfigReader,
  field = "actions",
): ActionInputConfig[] {
  return parseDispatchPayload(raw, reader, field).actions;
}

// {documentType?, name?, actions?} as an object or JSON text.
export function parseCreatePayload(
  raw: unknown,
  reader: ConfigReader,
): CreatePayload {
  if (raw === undefined || raw === null || raw === "") return {};
  const value = reader.json(raw, "payload");
  if (!isRecord(value)) {
    throw new Error(
      `${reader.block}: "payload" must be an object; got ${preview(value)}`,
    );
  }
  for (const key of ["documentType", "name"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      throw new Error(`${reader.block}: "payload.${key}" must be a string`);
    }
  }
  return {
    documentType: value.documentType as string | undefined,
    name: value.name as string | undefined,
    actions: value.actions,
  };
}

// An action's input: an object, or JSON text of one.
export function parseActionInput(
  raw: unknown,
  reader: ConfigReader,
): Record<string, unknown> {
  if (raw === undefined || raw === null || raw === "") return {};
  const value = reader.json(raw, "input");
  if (!isRecord(value)) {
    throw new Error(
      `${reader.block}: "input" must be an object; got ${preview(value)}`,
    );
  }
  return value;
}

// Whitelist for the dispatch action: a comma-separated string, a list of
// names, or a document-schema actions array.
export function allowedActionTypes(value: unknown): string[] {
  const raw = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const record = entry as { type?: unknown } | null;
      return typeof record?.type === "string" ? record.type : "";
    })
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// A design-time value that can actually be resolved: an expression cannot.
export function staticString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("{{")) return undefined;
  return trimmed;
}
