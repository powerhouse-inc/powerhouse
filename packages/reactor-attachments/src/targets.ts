import type {
  AttachmentDownloadTarget,
  AttachmentTargetHeaders,
  AttachmentUploadTarget,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Attachment target URL must be a non-empty string");
  }
  if (value.trim() !== value || hasForbiddenUrlWhitespace(value)) {
    throw new Error("Attachment target URL must not contain raw whitespace");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Attachment target URL is invalid");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new Error(
      "Attachment target URL must be HTTP(S) and must not contain credentials",
    );
  }
  // Return the original string: presigned URLs are opaque and must never be
  // normalized, decoded, reordered, or otherwise reconstructed.
  return value;
}

function parseHeaders(value: unknown): AttachmentTargetHeaders {
  if (!isRecord(value)) {
    throw new Error("Attachment target headers must be an object");
  }
  // A null prototype preserves valid names such as `__proto__` as ordinary
  // own properties instead of invoking Object.prototype setters.
  const headers = Object.create(null) as Record<string, string>;
  const headerName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  for (const [name, headerValue] of Object.entries(value)) {
    if (!headerName.test(name)) {
      throw new Error(`Attachment target header name is invalid: ${name}`);
    }
    if (
      typeof headerValue !== "string" ||
      hasForbiddenHeaderCharacter(headerValue)
    ) {
      throw new Error(`Attachment target header value is invalid: ${name}`);
    }
    headers[name] = headerValue;
  }
  return headers;
}

function hasForbiddenHeaderCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    // Horizontal tab is valid field whitespace. Other C0 controls, DEL, and
    // especially CR/LF are forbidden to prevent header injection.
    if (code <= 8 || (code >= 10 && code <= 31) || code === 127 || code > 255) {
      return true;
    }
  }
  return false;
}

function hasForbiddenUrlWhitespace(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    // URL parsing may silently trim or percent-encode raw ASCII whitespace.
    // Reject it so the validated opaque string is exactly what Fetch receives.
    if (code <= 32 || code === 127) return true;
  }
  return false;
}

function parseExpiry(value: unknown, required: boolean): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") {
    throw new Error("Attachment target expiry must be an ISO 8601 UTC string");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("Attachment target expiry must be an ISO 8601 UTC string");
  }
  return value;
}

export function parseAttachmentUploadTarget(
  value: unknown,
): AttachmentUploadTarget {
  if (!isRecord(value)) {
    throw new Error("Attachment upload target must be an object");
  }
  const url = parseUrl(value.url);
  const headers = parseHeaders(value.headers);
  switch (value.kind) {
    case "switchboard":
      if (value.method !== "PUT") {
        throw new Error("Switchboard upload target method must be PUT");
      }
      return {
        kind: "switchboard",
        method: "PUT",
        url,
        headers,
        ...(value.expiresAtUtc === undefined
          ? {}
          : { expiresAtUtc: parseExpiry(value.expiresAtUtc, false) }),
      };
    case "presigned-put":
      if (value.method !== "PUT") {
        throw new Error("Presigned upload target method must be PUT");
      }
      return {
        kind: "presigned-put",
        method: "PUT",
        url,
        headers,
        expiresAtUtc: parseExpiry(value.expiresAtUtc, true)!,
      };
    default:
      throw new Error("Attachment upload target kind is unknown");
  }
}

export function parseAttachmentDownloadTarget(
  value: unknown,
): AttachmentDownloadTarget {
  if (!isRecord(value)) {
    throw new Error("Attachment download target must be an object");
  }
  const url = parseUrl(value.url);
  const headers = parseHeaders(value.headers);
  switch (value.kind) {
    case "switchboard":
      if (value.method !== "GET") {
        throw new Error("Switchboard download target method must be GET");
      }
      return {
        kind: "switchboard",
        method: "GET",
        url,
        headers,
        ...(value.expiresAtUtc === undefined
          ? {}
          : { expiresAtUtc: parseExpiry(value.expiresAtUtc, false) }),
      };
    case "presigned-get":
      if (value.method !== "GET") {
        throw new Error("Presigned download target method must be GET");
      }
      return {
        kind: "presigned-get",
        method: "GET",
        url,
        headers,
        expiresAtUtc: parseExpiry(value.expiresAtUtc, true)!,
      };
    default:
      throw new Error("Attachment download target kind is unknown");
  }
}
