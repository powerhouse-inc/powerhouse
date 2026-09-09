/** Signature verification for inbound webhooks, over the raw bytes: a parse/re-encode
 * round trip changes key order, whitespace and duplicate keys, so every scheme here needs the exact octets the provider sent. */
import { createHmac, timingSafeEqual, type BinaryLike } from "node:crypto";

import type {
  WebhookHashAlgorithm,
  WebhookScheme,
  WebhookSignatureEncoding,
  WebhookVerification,
} from "@powerhousedao/shared/processors";

export type {
  WebhookHashAlgorithm,
  WebhookScheme,
  WebhookSignatureEncoding,
  WebhookVerification,
};

export const DEFAULT_TOLERANCE_SECONDS = 300;

/** Header each scheme reads when the caller does not name one: the name the format is
 * most often carried in, not a property of it, so `WebhookVerification.header` overrides any of them. */
export const DEFAULT_SCHEME_HEADER: Record<WebhookScheme, string> = {
  none: "",
  token: "x-webhook-token",
  hmac: "x-signature",
  "hmac-prefixed": "x-hub-signature-256",
  "hmac-timestamped": "stripe-signature",
};

export type VerifyResult = { ok: true } | { ok: false; reason: string };

const OK: VerifyResult = { ok: true };

/** Constant-time over equal-length inputs; a length mismatch is already a rejection, so
 * the early return leaks nothing a caller could not measure. */
function secureEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function hmacDigest(
  secret: string,
  payload: BinaryLike,
  verification: WebhookVerification,
): string {
  return createHmac(verification.algorithm ?? "sha256", secret)
    .update(payload)
    .digest(verification.encoding ?? "hex");
}

/** Hex folds case, so an uppercased digest still verifies. Base64 must not: two distinct
 * digests can differ only in case, so folding there would accept a signature that is not the one computed. */
function digestEquals(
  presented: string,
  expected: string,
  verification: WebhookVerification,
): boolean {
  const candidate = presented.trim();
  if ((verification.encoding ?? "hex") === "base64") {
    return secureEquals(candidate, expected);
  }
  return secureEquals(candidate.toLowerCase(), expected.toLowerCase());
}

/** The label `hmac-prefixed` expects before the digest. */
function signaturePrefix(verification: WebhookVerification): string {
  return verification.prefix ?? `${verification.algorithm ?? "sha256"}=`;
}

/** `t=<unix>,v1=<hex>[,v1=<hex>…]`. Several `v1` values appear while a secret is being
 * rotated, and any one of them matching is a pass. */
function parseTimestampedHeader(value: string): {
  timestamp?: number;
  signatures: string[];
} {
  const signatures: string[] = [];
  let timestamp: number | undefined;
  for (const part of value.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const item = part.slice(separator + 1).trim();
    if (key === "t") timestamp = Number(item);
    // Not lower-cased here: the encoding decides whether case matters, and
    // digestEquals is where that is known.
    else if (key === "v1") signatures.push(item);
  }
  return { timestamp, signatures };
}

export function schemeHeader(verification: WebhookVerification): string {
  return (
    verification.header ?? DEFAULT_SCHEME_HEADER[verification.scheme]
  ).toLowerCase();
}

/** Verifies a delivery against the configured scheme; `raw` must be the exact bytes
 * received. The reason is for the log only: callers answer a fixed 401, so a probing sender learns nothing from the body. */
export function verifyWebhook(options: {
  verification: WebhookVerification;
  headers: Record<string, string>;
  raw: Buffer;
  now?: Date;
}): VerifyResult {
  const { verification, headers, raw } = options;
  if (verification.scheme === "none") return OK;
  if (!verification.secret) {
    return { ok: false, reason: "signing secret missing" };
  }

  const header = schemeHeader(verification);
  // Absent and empty are one case: the index type hides the former.
  const presented: string | undefined = headers[header];
  if (!presented) return { ok: false, reason: `header "${header}" absent` };

  const secret = verification.secret;
  const tolerance = verification.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  switch (verification.scheme) {
    case "token":
      return secureEquals(presented, secret)
        ? OK
        : { ok: false, reason: "token mismatch" };
    case "hmac":
      return digestEquals(
        presented,
        hmacDigest(secret, raw, verification),
        verification,
      )
        ? OK
        : { ok: false, reason: "hmac mismatch" };
    case "hmac-prefixed": {
      const expected = `${signaturePrefix(verification)}${hmacDigest(secret, raw, verification)}`;
      return digestEquals(presented, expected, verification)
        ? OK
        : { ok: false, reason: "hmac mismatch" };
    }
    case "hmac-timestamped": {
      const { timestamp, signatures } = parseTimestampedHeader(presented);
      if (timestamp === undefined || !Number.isFinite(timestamp)) {
        return { ok: false, reason: "no timestamp in the signature header" };
      }
      if (signatures.length === 0) {
        return { ok: false, reason: "no v1 signature in the header" };
      }
      const nowMs = (options.now ?? new Date()).getTime();
      if (Math.abs(nowMs / 1000 - timestamp) > tolerance) {
        return { ok: false, reason: "timestamp outside the replay window" };
      }
      const expected = hmacDigest(
        secret,
        Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), raw]),
        verification,
      );
      // Every candidate is compared, so rotation does not change the timing.
      let matched = false;
      for (const signature of signatures) {
        if (digestEquals(signature, expected, verification)) matched = true;
      }
      return matched ? OK : { ok: false, reason: "hmac mismatch" };
    }
  }
}

/** Headers that would put a credential in a log or run journal. The configured signature
 * header joins them: it is an HMAC of the body under a live secret. */
const REDACTED_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-webhook-token",
  "x-signature",
  "x-hub-signature",
  "x-hub-signature-256",
  "stripe-signature",
]);

export const REDACTED = "[redacted]";

export function redactHeaders(
  headers: Record<string, string>,
  extra?: string,
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    redacted[key] =
      REDACTED_HEADERS.has(key) || (extra && key === extra.toLowerCase())
        ? REDACTED
        : value;
  }
  return redacted;
}

/** JSON and form bodies become objects; anything else stays decoded text, so a verified
 * XML or CSV payload is still reachable downstream. */
export function parseWebhookBody(raw: Buffer, contentType?: string): unknown {
  if (raw.length === 0) return undefined;
  const type = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const text = raw.toString("utf8");
  if (type === "application/json" || type.endsWith("+json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // A malformed body is still evidence; hand the text through.
      return text;
    }
  }
  if (type === "application/x-www-form-urlencoded") {
    return Object.fromEntries(new URLSearchParams(text));
  }
  return text;
}
