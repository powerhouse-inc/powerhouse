// Credential redaction for anything that gets journaled or shown to a user.
// Two independent passes, because each catches what the other misses.

// Key-based catches a credential the run never knew about: a piece's own
// hardcoded key, a token it fetched mid-step.

// Value-based catches a secret the run did resolve, wherever a piece spliced
// it — into a message, a URL, a header it composed itself.

export const REDACTED_PREFIX = "[redacted:";
export const SECRET_MARKER = "[redacted:secret]";
export const CIRCULAR_MARKER = "[circular]";
export const TRUNCATED_MARKER = "[truncated]";

// Bounds for the hostile-error path only. Ordinary step output is data a user
// asked for, so it is redacted whole rather than truncated.
const ERROR_MAX_DEPTH = 8;
const ERROR_MAX_NODES = 1000;

// Deep enough never to be reached by real data, shallow enough that the
// recursive walk cannot overflow the stack on a self-nesting object.
const STACK_GUARD_DEPTH = 200;

// Exact names, matched after stripping separators and case: "X-Api-Key",
// "x_api_key" and "apiKey" are one name.
const SENSITIVE_NAMES = new Set([
  "auth",
  "authorization",
  "proxyauthorization",
  "wwwauthenticate",
  "authtoken",
  "xauthtoken",
  "apikey",
  "xapikey",
  "apisecret",
  "bearer",
  "cookie",
  "setcookie",
  "credential",
  "credentials",
  "password",
  "passwd",
  "passphrase",
  "pwd",
  "privatekey",
  "secret",
  "secrettext",
  "sessionid",
  "signature",
  "token",
]);

// A name ending in one of these is sensitive whatever prefixes it, which is
// what catches githubToken, client_secret and the rest of the long tail.
const SENSITIVE_SUFFIXES = [
  "apikey",
  "credentials",
  "password",
  "privatekey",
  "secret",
  "token",
];

// Header and field names worth redacting inside a free-form string, where
// there is no key to walk.

// Deliberately a fixed list: a loose pattern over prose eats more of the
// message than it saves.

// Signature is the one alternative that carries its own affixes, because a
// webhook MAC header wraps the word: x-hub-signature-256.
const TEXT_FIELD = new RegExp(
  String.raw`\b(authorization|proxy-authorization|api[-_]?key|x-api-key|access[-_]?token|refresh[-_]?token|client[-_]?secret|set-cookie|cookie|password|secret|token|(?:[a-z0-9]+[-_])*signature(?:[-_][a-z0-9]+)*)\b(["']?)(\s*[:=]\s*)(["']?)((?:(?:Bearer|Basic|Token)\s+)?[^\s",;&)}]+)\4`,
  "gi",
);

const AUTH_SCHEME = /\b(Bearer|Basic|Token)\s+([A-Za-z0-9._~+/=-]{8,})/g;

const QUERY_PARAM = /([?&])([A-Za-z0-9_.%[\]-]+)=([^&\s"'<>]+)/g;

// The password half of a URL's userinfo, which no header or query pattern
// reaches: https://user:s3cret@host/api.
const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi;

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveName(name: string): boolean {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  if (SENSITIVE_NAMES.has(normalized)) return true;
  // Anywhere in the name, because a webhook MAC header carries its algorithm
  // after it: x-hub-signature-256.
  if (normalized.includes("signature")) return true;
  return SENSITIVE_SUFFIXES.some(
    (suffix) =>
      normalized.length > suffix.length && normalized.endsWith(suffix),
  );
}

function marker(name: string): string {
  return `[redacted:${name.toLowerCase()}]`;
}

function shannonEntropy(text: string): number {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// The bar a *guessed* secret must clear before its value is matched anywhere.

// A short or repetitive guess ("admin", "8080", "aaaaaaaa") would hit unrelated
// text and leave an error nobody can read; the key-based pass still covers it.
const MIN_VALUE_LENGTH = 8;
const MIN_DISTINCT_CHARS = 5;
const MIN_ENTROPY_BITS = 2;

// A value the host hands over is a declaration, not a guess, so "hunter2" is
// redacted. Only a value too short to be a credential is refused.
const MIN_DECLARED_LENGTH = 4;

export function isRedactableValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length < MIN_VALUE_LENGTH) return false;
  if (new Set(value).size < MIN_DISTINCT_CHARS) return false;
  return shannonEntropy(value) >= MIN_ENTROPY_BITS;
}

export function isDeclaredValue(value: unknown): value is string {
  return typeof value === "string" && value.length >= MIN_DECLARED_LENGTH;
}

// The AppConnectionValue discriminator, and anything shaped like an endpoint.

// Both are configuration rather than credentials, and a URL is usually the
// most useful thing left in a failed request's error.
const STRUCTURAL_NAMES = new Set(["type", "authtype"]);
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

// Every credential-shaped string leaf of a resolved connection. The fallback
// for a host resolver that cannot say which of its values are secret.
export function collectSecretValues(
  value: unknown,
  into: Set<string> = new Set(),
  depth = 0,
): Set<string> {
  if (depth > ERROR_MAX_DEPTH) return into;
  if (isRedactableValue(value)) {
    if (!URL_LIKE.test(value)) into.add(value);
    return into;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectSecretValues(entry, into, depth + 1);
    return into;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (STRUCTURAL_NAMES.has(normalizeName(key))) continue;
      collectSecretValues(entry, into, depth + 1);
    }
  }
  return into;
}

export interface RedactOptions {
  // Concrete secret values resolved for this step; each occurrence is replaced.
  values?: Iterable<string>;
  maxDepth?: number;
  maxNodes?: number;
}

// A host-side handle from a thrown error to the secrets its step ran with, so
// a catch far from the connection can still redact by value.
const thrownSecrets = new WeakMap<object, string[]>();

export function rememberSecrets<T>(error: T, values: string[]): T {
  if (typeof error === "object" && error !== null && values.length > 0) {
    thrownSecrets.set(error, values);
  }
  return error;
}

export function secretsFor(error: unknown): string[] {
  if (typeof error !== "object" || error === null) return [];
  return thrownSecrets.get(error) ?? [];
}

interface Pass {
  values: string[];
  maxDepth: number;
  maxNodes: number;
  nodes: number;
}

// Longest first, so a secret that contains another is replaced whole rather
// than leaving its tail behind.
function preparePass(options: RedactOptions | undefined): Pass {
  const values = [...(options?.values ?? [])]
    .filter(isDeclaredValue)
    .sort((a, b) => b.length - a.length);
  return {
    values,
    maxDepth: options?.maxDepth ?? STACK_GUARD_DEPTH,
    maxNodes: options?.maxNodes ?? Number.POSITIVE_INFINITY,
    nodes: 0,
  };
}

function safeDecode(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function replaceValues(text: string, values: string[]): string {
  let result = text;
  for (const value of values) {
    if (result.includes(value)) {
      result = result.split(value).join(SECRET_MARKER);
    }
    const encoded = encodeURIComponent(value);
    if (encoded !== value && result.includes(encoded)) {
      result = result.split(encoded).join(SECRET_MARKER);
    }
  }
  return result;
}

function redactText(text: string, pass: Pass): string {
  let result = replaceValues(text, pass.values);
  result = result.replace(
    URL_USERINFO,
    (_match, scheme: string, user: string) =>
      `${scheme}${user}:${marker("password")}@`,
  );
  result = result.replace(QUERY_PARAM, (match, sep: string, name: string) =>
    isSensitiveName(safeDecode(name)) ? `${sep}${name}=${marker(name)}` : match,
  );
  result = result.replace(
    AUTH_SCHEME,
    (_match, scheme: string) => `${scheme} ${marker(scheme)}`,
  );

  // Skipping a value that is already a marker keeps this pass from re-matching
  // what the query pass just wrote and swallowing the rest of the string.
  return result.replace(
    TEXT_FIELD,
    (
      match,
      name: string,
      nameQuote: string,
      sep: string,
      quote: string,
      value: string,
    ) =>
      value.startsWith(REDACTED_PREFIX)
        ? match
        : `${name}${nameQuote}${sep}${quote}${marker(name)}${quote}`,
  );
}

function walk(
  value: unknown,
  pass: Pass,
  depth: number,
  seen: Set<object>,
): unknown {
  if (typeof value === "string") return redactText(value, pass);
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return CIRCULAR_MARKER;
  if (depth >= pass.maxDepth) return TRUNCATED_MARKER;
  if (pass.nodes >= pass.maxNodes) return TRUNCATED_MARKER;
  pass.nodes += 1;

  // Tracked per path, not globally: the same object appearing twice in a tree
  // is not a cycle, and calling it one would drop data a user needs.
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => walk(entry, pass, depth + 1, seen));
    }
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = isSensitiveName(key)
        ? marker(key)
        : walk(entry, pass, depth + 1, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

// Redacts credentials from an arbitrary value: sensitive keys by name, known
// secret values wherever they appear, sensitive URL query parameters.

// Cycles are collapsed; nothing else is dropped, because this also runs over
// step output a user asked to see.
export function redact(value: unknown, options?: RedactOptions): unknown {
  return walk(value, preparePass(options), 0, new Set());
}

// The same pass for an error object, which is attacker-shaped: depth and node
// count are capped so a hostile error cannot make redaction expensive.
export function redactError(value: unknown, options?: RedactOptions): unknown {
  return redact(value, {
    maxDepth: ERROR_MAX_DEPTH,
    maxNodes: ERROR_MAX_NODES,
    ...options,
  });
}

// True when a value carries a marker this module wrote. Rerun uses it to
// refuse a journaled output it cannot faithfully replay.
export function containsRedactedMarker(value: unknown, depth = 0): boolean {
  if (typeof value === "string") return value.includes(REDACTED_PREFIX);
  if (typeof value !== "object" || value === null) return false;
  if (depth >= STACK_GUARD_DEPTH) return false;
  return Object.values(value).some((entry) =>
    containsRedactedMarker(entry, depth + 1),
  );
}

// The string-only form, for a message that is already flat text.
export function redactMessage(text: string, options?: RedactOptions): string {
  return redactText(text, preparePass(options));
}
