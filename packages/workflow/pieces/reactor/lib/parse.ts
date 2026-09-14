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
      value = JSON.parse(unfence(value));
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
    const text = unfence(record);
    if (!text) return {};
    try {
      record = JSON.parse(text);
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
