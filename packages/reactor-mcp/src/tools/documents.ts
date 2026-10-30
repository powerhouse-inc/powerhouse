import type { PHDocument } from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { applyJsonPath, JsonPathError } from "./jsonpath.js";
import { ReactorToolError } from "./errors.js";

export const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";
/** Document types that hold files, as the reactor's drive containers. */
export const DRIVE_DOCUMENT_TYPES: ReadonlySet<string> = new Set([
  DRIVE_DOCUMENT_TYPE,
  "powerhouse/reactor-drive",
]);
export const DEFAULT_BRANCH = "main";

export type TrimLimits = {
  maxArrayItems: number;
  maxStringLength: number;
  maxDepth: number;
};

export const DEFAULT_TRIM_LIMITS: TrimLimits = {
  maxArrayItems: 25,
  maxStringLength: 2000,
  maxDepth: 8,
};

/** Caps arrays, strings and depth, leaving a marker where it cut. */
export function trimValue(
  value: unknown,
  limits: Partial<TrimLimits> = {},
): { value: unknown; truncated: boolean } {
  const l = { ...DEFAULT_TRIM_LIMITS, ...limits };
  let truncated = false;
  const walk = (v: unknown, depth: number): unknown => {
    if (typeof v === "string") {
      if (v.length <= l.maxStringLength) return v;
      truncated = true;
      return `${v.slice(0, l.maxStringLength)}…[+${v.length - l.maxStringLength} chars]`;
    }
    if (v === null || typeof v !== "object") return v;
    if (Object.keys(v).length === 0) return v;
    if (depth >= l.maxDepth) {
      truncated = true;
      return Array.isArray(v)
        ? `[array of ${v.length}]`
        : `[object with keys: ${Object.keys(v).join(", ")}]`;
    }
    if (Array.isArray(v)) {
      const items = v.slice(0, l.maxArrayItems).map((i) => walk(i, depth + 1));
      if (v.length > l.maxArrayItems) {
        truncated = true;
        items.push(`…${v.length - l.maxArrayItems} more items`);
      }
      return items;
    }
    return Object.fromEntries(
      Object.entries(v).map(([k, child]) => [k, walk(child, depth + 1)]),
    );
  };
  return { value: walk(value, 0), truncated };
}

export const documentSummarySchema = z.object({
  id: z.string(),
  documentType: z.string(),
  name: z.string(),
});

export type DocumentSummary = z.infer<typeof documentSummarySchema>;

function globalState(document: PHDocument): Record<string, unknown> {
  const global = (document.state as { global?: unknown }).global;
  return global && typeof global === "object"
    ? (global as Record<string, unknown>)
    : {};
}

// Models usually keep the display name in state; the header name can lag.
export function documentName(document: PHDocument): string {
  const name = globalState(document).name;
  return document.header.name || (typeof name === "string" ? name : "");
}

export function documentSummary(document: PHDocument): DocumentSummary {
  return {
    id: document.header.id,
    documentType: document.header.documentType,
    name: documentName(document),
  };
}

export const documentViewSchema = documentSummarySchema.extend({
  slug: z.string().optional(),
  branch: z.string(),
  revision: z.record(z.string(), z.number()),
  lastModifiedAtUtcIso: z.string().optional(),
  state: z
    .unknown()
    .describe("The model scopes, or the filter's match when one was given"),
  truncated: z
    .boolean()
    .optional()
    .describe(
      "True when long arrays or strings were cut; a filter reads the part it selects in full",
    ),
});

export type DocumentView = z.infer<typeof documentViewSchema>;

export type DocumentViewOptions = {
  /** JSONPath against the whole state, e.g. `$.global.items[0]`. */
  filter?: string;
  /** Scopes shown without a filter; empty scopes are left out. */
  scopes?: readonly string[];
  limits?: Partial<TrimLimits>;
};

/** A filter's match is returned whole up to this many JSON characters. */
export const MAX_FILTERED_CHARS = 100_000;

function jsonLength(value: unknown): number {
  try {
    return (JSON.stringify(value) as string | undefined)?.length ?? 0;
  } catch {
    return Infinity;
  }
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    (value !== null &&
      typeof value === "object" &&
      Object.keys(value).length === 0)
  );
}

/** A compact document: header essentials plus model state, projected and trimmed. */
export function documentView(
  document: PHDocument,
  options: DocumentViewOptions = {},
): DocumentView {
  const { filter, scopes = ["global", "local"], limits } = options;
  const state = document.state as Record<string, unknown>;
  let selected: unknown;
  if (filter) {
    try {
      selected = applyJsonPath(state, filter);
    } catch (error) {
      if (error instanceof JsonPathError) {
        throw new ReactorToolError("INVALID_ACTION", error.message);
      }
      throw error;
    }
  } else {
    selected = Object.fromEntries(
      scopes
        .filter((scope) => !isEmpty(state[scope]))
        .map((scope) => [scope, state[scope]]),
    );
  }
  // A filter reads its part in full; only an oversized match is cut.
  const trimmed =
    filter && jsonLength(selected) <= MAX_FILTERED_CHARS
      ? { value: selected, truncated: false }
      : trimValue(selected, limits);
  const header = document.header;
  return {
    ...documentSummary(document),
    ...(header.slug ? { slug: header.slug } : {}),
    branch: header.branch || DEFAULT_BRANCH,
    revision: { ...header.revision },
    ...(header.lastModifiedAtUtcIso
      ? { lastModifiedAtUtcIso: header.lastModifiedAtUtcIso }
      : {}),
    state: trimmed.value,
    ...(trimmed.truncated ? { truncated: true } : {}),
  };
}
