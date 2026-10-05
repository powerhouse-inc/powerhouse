// Config parsing for the core webhook trigger: the editor-facing shape of its form.
// Verification, redaction and payload mechanics belong to the reactor's service.
import type {
  WebhookField,
  WebhookHashAlgorithm,
  WebhookSignatureEncoding,
} from "@powerhousedao/shared/processors";

// Prefixes a config error, as the schedule's parser does.
const WEBHOOK = "Webhook";

export const WEBHOOK_TRIGGER_KIND = "webhook";

export const DEFAULT_TOLERANCE_SECONDS = 300;
export const DEFAULT_DEDUPE_TTL_SECONDS = 300;
export const DEFAULT_RESPONSE_STATUS = 202;
export const DEFAULT_SYNC_RESPONSE_STATUS = 200;

// Signature layout named by wire format, not by sender; hash and encoding are
// separate, so no name carries them. Mirrors the reactor's own WebhookScheme.
export type WebhookScheme =
  | "none"
  | "token"
  | "hmac"
  | "hmac-prefixed"
  | "hmac-timestamped";

const ALGORITHMS = new Set<WebhookHashAlgorithm>(["sha1", "sha256", "sha512"]);
const ENCODINGS = new Set<WebhookSignatureEncoding>(["hex", "base64"]);

// A signed scheme with no secret is a configuration error, not a runtime one.
const SIGNED_SCHEMES = new Set<WebhookScheme>([
  "token",
  "hmac",
  "hmac-prefixed",
  "hmac-timestamped",
]);

const SCHEMES = new Set<WebhookScheme>([
  "none",
  "token",
  "hmac",
  "hmac-prefixed",
  "hmac-timestamped",
]);

// The header each format is most often carried in; the author can override it.
const DEFAULT_HEADER: Record<WebhookScheme, string> = {
  none: "",
  token: "x-webhook-token",
  hmac: "x-signature",
  "hmac-prefixed": "x-hub-signature-256",
  "hmac-timestamped": "stripe-signature",
};

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
] as const;

export interface WebhookConfig {
  // Uppercase; undefined accepts every method.
  methods?: string[];
  scheme: WebhookScheme;
  // Lowercase header the signature/token is read from; "" when scheme is none.
  header: string;
  // secret://v1: ref resolved through the secret store at delivery time.
  secretRef?: string;
  // Replay window for the timestamped scheme.
  toleranceSeconds: number;
  // Digest options a sender picks independently of the layout; undefined leaves
  // the reactor's defaults (sha256, hex, algorithm-derived label) in place.
  algorithm?: WebhookHashAlgorithm;
  encoding?: WebhookSignatureEncoding;
  // "" is a real value: a prefixed layout carrying no label at all. Only
  // undefined means "the algorithm's own label".
  prefix?: string;
  // async answers before the run; sync waits for it and reports the outcome.
  responseMode: "async" | "sync";
  responseStatus: number;
  // A field echoed back verbatim instead of starting a run; Activepieces
  // spends onHandshake on the same provider round.
  challengeField?: WebhookField;
  // Where the provider's own event id is. Present, it is the authoritative
  // dedup key for redeliveries (plan/08 §7.2).
  dedupeField?: WebhookField;
  dedupeTtlSeconds: number;
}

function asRecord(config: unknown): Record<string, unknown> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return config as Record<string, unknown>;
  }
  throw new Error(`${WEBHOOK}: the config must be an object`);
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

// Where a provider put a value: a bare name is a query param or top-level body field.
// `header:`/`body:` prefixes exist because senders disagree; object form is accepted too.
function parseWebhookField(value: unknown): WebhookField | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const header = nonEmptyString(record.header);
    if (header) return { header: header.toLowerCase() };
    const body = nonEmptyString(record.body);
    if (body) return { body };
    throw new Error(
      `${WEBHOOK}: a field source must name either "header" or "body"`,
    );
  }
  const text = nonEmptyString(value);
  if (!text) return undefined;
  // Only these two prefixes are a source. Any other colon is part of the name,
  // so a provider that uses one in a field name still resolves.
  const match = /^(header|body)\s*:\s*(\S.*)$/i.exec(text);
  if (!match) return text;
  const source = match[1].toLowerCase();
  const name = match[2].trim();
  return source === "header" ? { header: name.toLowerCase() } : { body: name };
}

// "" is the empty label, kept as given; only an absent prefix is the default.
function parsePrefix(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${WEBHOOK}: "prefix" must be a string`);
  }
  return value;
}

// A named choice, compared exactly and rejected loudly: an unknown hash would
// otherwise reach the reactor and fail every delivery.
function parseEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  field: string,
): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(
      `${WEBHOOK}: "${field}" must be one of ${[...allowed].join(", ")}`,
    );
  }
  return value as T;
}

const METHOD_CHOICES = new Set<string>([...HTTP_METHODS, "ANY"]);

const RESPONSE_MODES = new Set(["async", "sync"] as const);

// "ANY" or no value means every method; the editor spells it "ANY".
function parseMethods(value: unknown): string[] | undefined {
  const list = Array.isArray(value) ? value : [value];
  const methods = list.flatMap((method) => {
    const parsed = parseEnum(method, METHOD_CHOICES, "methods");
    return parsed ? [parsed] : [];
  });
  if (methods.includes("ANY")) {
    if (methods.length > 1) {
      throw new Error(`${WEBHOOK}: "ANY" cannot be listed with methods`);
    }
    return undefined;
  }
  return methods.length ? methods : undefined;
}

// Config: { methods?, scheme, header?, secretRef?, toleranceSeconds?,
// responseMode?, responseStatus?, challengeField? }.
export function parseWebhookConfig(config: unknown): WebhookConfig {
  const record = asRecord(config);
  // No default: an unverified endpoint must be chosen, never fallen into.
  if (record.scheme === undefined || record.scheme === null) {
    throw new Error(
      `${WEBHOOK}: "scheme" is required; choose "none" for an endpoint guarded only by its URL token`,
    );
  }
  const scheme = parseEnum(record.scheme, SCHEMES, "scheme")!;
  const secretRef = nonEmptyString(record.secretRef);
  if (SIGNED_SCHEMES.has(scheme) && !secretRef) {
    throw new Error(`${WEBHOOK}: the "${scheme}" scheme needs a "secretRef"`);
  }
  const responseMode =
    parseEnum(record.responseMode, RESPONSE_MODES, "responseMode") ?? "async";
  const status =
    toNumber(record.responseStatus) ??
    (responseMode === "sync"
      ? DEFAULT_SYNC_RESPONSE_STATUS
      : DEFAULT_RESPONSE_STATUS);
  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new Error(
      `${WEBHOOK}: "responseStatus" must be an integer between 200 and 599`,
    );
  }
  const tolerance =
    toNumber(record.toleranceSeconds) ?? DEFAULT_TOLERANCE_SECONDS;
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error(`${WEBHOOK}: "toleranceSeconds" must be a positive number`);
  }
  const dedupeTtl =
    toNumber(record.dedupeTtlSeconds) ?? DEFAULT_DEDUPE_TTL_SECONDS;
  if (!Number.isFinite(dedupeTtl) || dedupeTtl <= 0) {
    throw new Error(`${WEBHOOK}: "dedupeTtlSeconds" must be a positive number`);
  }
  return {
    methods: parseMethods(record.methods),
    scheme,
    header: (
      nonEmptyString(record.header) ?? DEFAULT_HEADER[scheme]
    ).toLowerCase(),
    secretRef,
    toleranceSeconds: tolerance,
    responseMode,
    responseStatus: status,
    algorithm: parseEnum(record.algorithm, ALGORITHMS, "algorithm"),
    encoding: parseEnum(record.encoding, ENCODINGS, "encoding"),
    prefix: parsePrefix(record.prefix),
    challengeField: parseWebhookField(record.challengeField),
    dedupeField: parseWebhookField(record.dedupeField),
    dedupeTtlSeconds: dedupeTtl,
  };
}

/** The trigger payload, shaped like Activepieces' catch-webhook contract so
 * authored expressions and adapted pieces agree on where a request's parts are. */
export interface WebhookPayload {
  method: string;
  path: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: unknown;
}
