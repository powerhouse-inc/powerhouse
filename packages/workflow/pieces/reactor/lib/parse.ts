// Config parsing shared by the document actions.

// Every one of these accepts what a model step produces as readily as what an
// author typed: fenced JSON, a bare object, a quoted id inside a sentence.
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

function unfence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

// Every top-level {...} or [...] in a string, in the order they appear.
//
// Scanned rather than matched with a regular expression because a brace inside
// a string literal is not a brace: `{"note": "a } here"}` is one value, and a
// regex that does not track quoting splits it.
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

// JSON out of whatever a model actually said.
//
// The prompt asks for JSON alone and a model may still reason out loud first:
// a reasoning model answered this piece with two pages of deliberation and the
// object on the last line, behind a leaked channel marker. Fences were already
// tolerated here for the same reason — this is the same accommodation, one step
// further.
//
// The LAST top-level value wins, because the pattern is deliberation first and
// answer last; an example the model quoted from the prompt would otherwise be
// preferred over the answer it worked out.
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

export function parseActions(
  value: unknown,
  blockName: string,
): ActionInputConfig[] {
  return parseDispatchPayload(value, blockName).actions;
}

// Accepts an array, a single action object, or JSON text (typically an LLM's
// output, possibly fenced); an object may also carry the target documentId.
export function parseDispatchPayload(
  value: unknown,
  blockName: string,
): DispatchPayload {
  let documentId: string | undefined;
  if (typeof value === "string") {
    try {
      value = parseModelJson(value);
    } catch {
      throw new Error(`${blockName}: "actions" is a string but not valid JSON`);
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.documentId === "string") documentId = record.documentId;
    value = Array.isArray(record.actions) ? record.actions : [value];
  }
  if (!Array.isArray(value)) return { documentId, actions: [] };
  const actions = value.map((entry, index) => {
    const record = entry as Record<string, unknown> | null;
    if (!record || typeof record.type !== "string") {
      throw new Error(`${blockName}: actions[${index}] needs a string "type"`);
    }
    return {
      type: record.type,
      input: record.input,
      scope: typeof record.scope === "string" ? record.scope : undefined,
    };
  });
  return { documentId, actions };
}

// {documentType, name, actions?} as an object or as JSON text, possibly fenced.
export function parseCreatePayload(
  value: unknown,
  blockName: string,
): CreatePayload {
  let record = value;
  if (typeof record === "string") {
    if (unfence(record) === "") return {};
    try {
      record = parseModelJson(record);
    } catch {
      throw new Error(`${blockName}: "payload" is a string but not valid JSON`);
    }
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  const entry = record as Record<string, unknown>;
  return {
    documentType:
      typeof entry.documentType === "string" ? entry.documentType : undefined,
    name: typeof entry.name === "string" ? entry.name : undefined,
    actions: entry.actions,
  };
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

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Ids fed by an AI step arrive quoted, fenced or wrapped in prose; documents
// are addressed by uuid, so prefer one when the text contains it.
export function resolveDocumentId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const uuid = UUID.exec(text);
  if (uuid) return uuid[0];
  // Slugs are valid identifiers too, so fall back to the bare text.
  return text.replace(/^["'`]+|["'`]+$/g, "").trim() || undefined;
}

// A design-time value that can actually be resolved: an expression cannot.
export function staticString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("{{")) return undefined;
  return trimmed;
}
