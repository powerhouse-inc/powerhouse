// Run-time coercion of stored config values into the shapes pieces expect:
// the editor stores canonical values, the worker normalises before run().
import type { ApProperty } from "../types.js";
import {
  assertWithinLimit,
  DEFAULT_MAX_FILE_BYTES,
  maxFileBytes,
} from "./limits.js";

// Framework ApFile (filename, data, extension, base64) as a plain object so
// it survives IPC and structured cloning.
export interface ApFileValue {
  filename: string;
  extension?: string;
  base64: string;
  data: Buffer;
}

export interface FetchedFile {
  data: Buffer;
  filename?: string;
  contentType?: string;
}

export interface NormalizeOptions {
  // Resolves a URL-valued FILE prop; defaults to fetch() with a size cap.
  fetchFile?: (url: string) => Promise<FetchedFile>;
  // Resolves a reference-valued FILE prop (attachment:// or apfile://). The
  // worker resolves these from files the host staged on disk, so the bytes
  // never cross IPC.
  resolveRef?: (ref: string) => Promise<FetchedFile>;
}

// Re-exported for compatibility; the ceiling itself lives in limits.ts so the
// inbound and outbound paths cannot drift apart.
export const MAX_FILE_BYTES = DEFAULT_MAX_FILE_BYTES;
const FETCH_TIMEOUT_MS = 30_000;

// A FILE prop whose value is a reference the host has to resolve.
const FILE_REF = /^(?:attachment|apfile):\/\//i;

export class FileFetchError extends Error {
  constructor(url: string, reason: string) {
    super(`Could not fetch FILE prop "${url}": ${reason}`);
    this.name = "FileFetchError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

export function toNumber(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

export function toBoolean(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false" || lowered === "") return false;
  }
  return value;
}

// Arrays pass through; a JSON array string parses; any other non-empty
// string is a single item; "" is the empty list.
export function toArray(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    if (value.trim() === "") return [];
    const parsed = parseJsonString(value);
    return Array.isArray(parsed) ? parsed : [value];
  }
  return [value];
}

export function toIsoDateTime(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? value : value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const ms = Date.parse(trimmed);
    return Number.isNaN(ms) ? value : new Date(ms).toISOString();
  }
  return value;
}

const DATA_URI = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/;

function extensionOf(filename: string): string | undefined {
  const dot = filename.lastIndexOf(".");
  return dot > 0 && dot < filename.length - 1
    ? filename.slice(dot + 1)
    : undefined;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/json": "json",
  "text/plain": "txt",
  "text/csv": "csv",
};

function toFileValue(
  data: Buffer,
  filename: string | undefined,
  contentType: string | undefined,
): ApFileValue {
  const mime = contentType?.split(";")[0].trim().toLowerCase();
  const mimeExtension = mime ? MIME_EXTENSIONS[mime] : undefined;
  const name =
    filename && filename !== ""
      ? filename
      : `file${mimeExtension ? `.${mimeExtension}` : ""}`;
  const extension = extensionOf(name) ?? mimeExtension;
  return {
    filename: name,
    ...(extension ? { extension } : {}),
    base64: data.toString("base64"),
    data,
  };
}

function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const utf8 = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : undefined;
}

async function defaultFetchFile(url: string): Promise<FetchedFile> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new FileFetchError(
      url,
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!response.ok) throw new FileFetchError(url, `HTTP ${response.status}`);
  const limit = maxFileBytes();
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new FileFetchError(url, `${declared} bytes exceeds ${limit}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength > limit) {
    throw new FileFetchError(url, `${data.byteLength} bytes exceeds ${limit}`);
  }
  let filename = filenameFromDisposition(
    response.headers.get("content-disposition"),
  );
  if (!filename) {
    const segment = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (segment) filename = decodeURIComponent(segment);
  }
  return {
    data,
    filename,
    contentType: response.headers.get("content-type") ?? undefined,
  };
}

function isFileShaped(value: unknown): value is ApFileValue {
  return (
    isRecord(value) &&
    typeof value.filename === "string" &&
    (typeof value.base64 === "string" || Buffer.isBuffer(value.data))
  );
}

// URL or data URI → ApFile shape; already-shaped objects are completed
// (data/base64 derived from each other); anything else passes through.
export async function toApFile(
  value: unknown,
  options: NormalizeOptions = {},
): Promise<unknown> {
  if (isFileShaped(value)) {
    const data = Buffer.isBuffer(value.data)
      ? value.data
      : Buffer.from(value.base64, "base64");
    // The cap applies to every branch, not just the fetched one: an oversized
    // data URI or file-shaped object would otherwise slip past it.
    assertWithinLimit(data.byteLength);
    const extension = value.extension ?? extensionOf(value.filename);
    return {
      ...value,
      ...(extension ? { extension } : {}),
      base64:
        typeof value.base64 === "string"
          ? value.base64
          : data.toString("base64"),
      data,
    };
  }
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const dataUri = DATA_URI.exec(trimmed);
  if (dataUri) {
    const [, mime, params, payload] = dataUri;
    const isBase64 = /;base64/i.test(params);
    const data = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    assertWithinLimit(data.byteLength);
    const nameParam = /;name=([^;]+)/i.exec(params)?.[1];
    return toFileValue(
      data,
      nameParam ? decodeURIComponent(nameParam) : undefined,
      mime || undefined,
    );
  }
  if (FILE_REF.test(trimmed)) {
    if (!options.resolveRef) {
      throw new FileFetchError(
        trimmed,
        "no attachment resolver is available in this context",
      );
    }
    const resolved = await options.resolveRef(trimmed);
    assertWithinLimit(resolved.data.byteLength);
    return toFileValue(resolved.data, resolved.filename, resolved.contentType);
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const fetched = await (options.fetchFile ?? defaultFetchFile)(trimmed);
    return toFileValue(fetched.data, fetched.filename, fetched.contentType);
  }
  return value;
}

export async function normalizeValue(
  prop: ApProperty,
  value: unknown,
  options: NormalizeOptions = {},
): Promise<unknown> {
  if (value === undefined || value === null) return value;
  switch (prop.type) {
    case "NUMBER":
      return toNumber(value);
    case "CHECKBOX":
      return toBoolean(value);
    case "JSON":
      return parseJsonString(value);
    case "OBJECT": {
      const parsed = parseJsonString(value);
      return isRecord(parsed) ? parsed : value;
    }
    case "MULTI_SELECT_DROPDOWN":
    case "STATIC_MULTI_SELECT_DROPDOWN":
      return toArray(value);
    case "ARRAY": {
      const items = toArray(value);
      if (!prop.properties || !Array.isArray(items)) return items;
      const fields = prop.properties;
      const list: unknown[] = items;
      return Promise.all(
        list.map((item) =>
          isRecord(item) ? normalizePropsValue(fields, item, options) : item,
        ),
      );
    }
    case "DATE_TIME":
      return toIsoDateTime(value);
    case "FILE":
      return toApFile(value, options);
    default:
      return value;
  }
}

// Normalises every configured value with a matching prop schema; keys
// without a schema (or props without a value) pass through untouched.
export async function normalizePropsValue(
  props: Record<string, ApProperty> | undefined,
  values: Record<string, unknown>,
  options: NormalizeOptions = {},
): Promise<Record<string, unknown>> {
  if (!props || !isRecord(values)) return values;
  const out: Record<string, unknown> = { ...values };
  for (const [name, prop] of Object.entries(props)) {
    if (!(name in out) || !isRecord(prop)) continue;
    const normalized = await normalizeValue(prop, out[name], options);
    if (normalized === undefined) delete out[name];
    else out[name] = normalized;
  }
  return out;
}
