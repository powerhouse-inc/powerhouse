// Run-time coercion of stored config values into the shapes pieces expect: the
// engine's own property processors, with our file hydration in front of theirs.
import type { PieceProperty } from "@powerhousedao/pieces-framework";
import {
  arrayZipperProcessor,
  processors,
  validateProperty,
  type ProcessorFn,
} from "@powerhousedao/pieces-framework/host";
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

// ARRAY has no entry in the processor table: the engine zips an object of
// parallel arrays into rows itself, then processes each row's own props.
async function normalizeArray(
  prop: ApProperty,
  value: unknown,
  options: NormalizeOptions,
): Promise<unknown> {
  const fields = prop.properties;
  if (!fields) return value;
  const zipped: unknown = arrayZipperProcessor(prop as PieceProperty, value);
  if (!Array.isArray(zipped)) return value;
  return Promise.all(
    (zipped as unknown[]).map((item) =>
      isRecord(item) ? normalizePropsValue(fields, item, options) : item,
    ),
  );
}

// An ApFile is a class instance whose base64 is a prototype getter, and no
// structured clone carries either; flatten it at the boundary (see ApFileValue).
function plainFile(value: unknown): unknown {
  if (!isRecord(value) || typeof value.filename !== "string") return value;
  const { data } = value;
  if (!Buffer.isBuffer(data)) return value;
  const extension =
    typeof value.extension === "string"
      ? value.extension
      : extensionOf(value.filename);
  return {
    filename: value.filename,
    ...(extension ? { extension } : {}),
    base64:
      typeof value.base64 === "string" ? value.base64 : data.toString("base64"),
    data,
  };
}

const table = processors as Record<string, ProcessorFn | undefined>;

// The types whose processor failing means "not JSON", not "not usable".
const JSON_LIKE = new Set(["JSON", "OBJECT"]);

export async function normalizeValue(
  prop: ApProperty,
  value: unknown,
  options: NormalizeOptions = {},
): Promise<unknown> {
  if (value === undefined || value === null) return value;
  if (prop.type === "ARRAY") return normalizeArray(prop, value, options);
  if (prop.type === "FILE") {
    // Our hydration owns the forms the engine's own processor cannot resolve:
    // attachment and apfile refs, the size cap, and a host-injected fetcher.
    const hydrated = await toApFile(value, options);
    if (typeof hydrated !== "string") return hydrated;
    return plainFile(await table.FILE?.(prop as PieceProperty, hydrated));
  }
  const type = prop.type;
  const processor = type ? table[type] : undefined;
  if (!processor) return value;
  const processed = plainFile(await processor(prop as PieceProperty, value));
  // Every other type keeps its promise to the piece: a DATE_TIME prop is an
  // ISO string or nothing, a NUMBER is a number or NaN. JSON is the exception,
  // because the thing most often routed into one is a model's answer, and a
  // model wraps its object in prose. jsonProcessor answers undefined for that,
  // which would drop the value entirely — so hand back what the author wrote
  // and let the piece parse it. The pieces that take model output this way
  // carry their own tolerant parsing for exactly this case.
  if (processed === undefined && type && JSON_LIKE.has(type) && value !== "") {
    return value;
  }
  return processed;
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

// Upstream's error shape: a field's messages, or an ARRAY's per-row errors.
export interface PropsValidationErrors {
  [key: string]: string[] | { properties: PropsValidationErrors[] };
}

function hasErrors(errors: PropsValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

// normalizeValue hands a JSON prop's unparseable text back on purpose; the
// validator would call that "not JSON".
function isToleratedJson(
  prop: ApProperty,
  value: unknown,
  original: unknown,
): boolean {
  return (
    prop.type !== undefined &&
    JSON_LIKE.has(prop.type) &&
    typeof value === "string" &&
    value === original
  );
}

// Upstream's validator over values our processors already coerced. Every
// declared prop is checked, so a required one that is absent fails too.
export function validatePropsValue(
  props: Record<string, ApProperty> | undefined,
  processed: Record<string, unknown>,
  original: Record<string, unknown>,
): PropsValidationErrors {
  const errors: PropsValidationErrors = {};
  if (!props) return errors;
  for (const [name, prop] of Object.entries(props)) {
    if (!isRecord(prop)) continue;
    const value = processed[name];
    const raw = original[name];
    if (prop.type === "ARRAY" && prop.properties && Array.isArray(value)) {
      const zipped: unknown = arrayZipperProcessor(prop as PieceProperty, raw);
      const rawRows = Array.isArray(zipped) ? (zipped as unknown[]) : [];
      const rows = (value as unknown[]).map((row, index) => {
        const rawRow = rawRows[index];
        return isRecord(row)
          ? validatePropsValue(
              prop.properties,
              row,
              isRecord(rawRow) ? rawRow : row,
            )
          : {};
      });
      if (rows.some(hasErrors)) errors[name] = { properties: rows };
      continue;
    }
    if (isToleratedJson(prop, value, raw)) continue;
    const messages = validateProperty(prop as PieceProperty, value, raw);
    if (messages.length > 0) errors[name] = messages;
  }
  return errors;
}

function describeErrors(
  errors: PropsValidationErrors,
  props: Record<string, ApProperty> | undefined,
  path = "",
): string[] {
  return Object.entries(errors).flatMap(([name, entry]) => {
    const label = path
      ? `${path}.${name}`
      : `${props?.[name]?.displayName ?? name} (${name})`;
    if (Array.isArray(entry)) return [`${label}: ${entry.join(", ")}`];
    const rowProps = props?.[name]?.properties;
    return entry.properties.flatMap((row, index) =>
      describeErrors(row, rowProps, `${path ? label : name}[${index}]`),
    );
  });
}

// Thrown before piece code runs; `errors` carries upstream's shape.
export class PropsValidationError extends Error {
  constructor(
    owner: string,
    readonly errors: PropsValidationErrors,
    props: Record<string, ApProperty> | undefined,
  ) {
    super(
      `Invalid input for ${owner}: ${describeErrors(errors, props).join("; ")}`,
    );
    this.name = "PropsValidationError";
  }
}

// What the builder writes into a step upstream: a prop left unset takes its
// defaultValue, the value the editor shows for it.
function withDefaults(
  props: Record<string, ApProperty>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...values };
  for (const [name, prop] of Object.entries(props)) {
    if (!isRecord(prop)) continue;
    if (!(name in out)) {
      if (prop.defaultValue !== undefined) out[name] = prop.defaultValue;
      continue;
    }
    const fields = prop.properties;
    if (prop.type !== "ARRAY" || !fields) continue;
    const rows: unknown = arrayZipperProcessor(
      prop as PieceProperty,
      out[name],
    );
    if (Array.isArray(rows)) {
      out[name] = (rows as unknown[]).map((row) =>
        isRecord(row) ? withDefaults(fields, row) : row,
      );
    }
  }
  return out;
}

// Defaults, coercion, then validation: the values run() receives, or a
// PropsValidationError naming each field that failed.
export async function preparePropsValue(
  owner: string,
  props: Record<string, ApProperty> | undefined,
  values: Record<string, unknown>,
  options: NormalizeOptions = {},
): Promise<Record<string, unknown>> {
  if (!props || !isRecord(values)) return values;
  const original = withDefaults(props, values);
  const processed = await normalizePropsValue(props, original, options);
  const errors = validatePropsValue(props, processed, original);
  if (hasErrors(errors)) {
    throw new PropsValidationError(owner, errors, props);
  }
  return processed;
}
