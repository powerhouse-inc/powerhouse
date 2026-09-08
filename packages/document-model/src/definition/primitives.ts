import type { JsonValue } from "@powerhousedao/shared/document-model";

export const DOCUMENT_MODEL_IDENTITY_NAMESPACE =
  "f80a5a40-200a-5996-b2af-2c0996a4135e" as const;

export type IdentityKind =
  | "module"
  | "operation"
  | "error"
  | "state-example"
  | "operation-example";

export function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function isGraphQLName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !value.startsWith("__") &&
    /^[_A-Za-z][_0-9A-Za-z]*$/.test(value)
  );
}

function jsonPath(parent: string, key: string | number): string {
  if (typeof key === "number") return `${parent}[${key}]`;
  return `${parent}.${key}`;
}

type UndefinedPolicy = "reject" | "json-compatible";

function normalizeJsonValue(
  value: unknown,
  path: string,
  undefinedPolicy: UndefinedPolicy,
): JsonValue {
  const ancestors = new Set<object>();

  function snapshot(candidate: unknown, candidatePath: string): JsonValue {
    if (candidate === undefined && undefinedPolicy === "json-compatible") {
      return null;
    }
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean"
    ) {
      return candidate;
    }
    if (typeof candidate === "number") {
      if (Number.isFinite(candidate)) return candidate;
      throw new TypeError(`${candidatePath} must be a finite JSON number.`);
    }
    if (typeof candidate !== "object") {
      throw new TypeError(
        `${candidatePath} must be ${
          undefinedPolicy === "reject" ? "a JSON value" : "JSON-compatible"
        }.`,
      );
    }
    if (ancestors.has(candidate)) {
      throw new TypeError(`${candidatePath} must not contain a cycle.`);
    }

    ancestors.add(candidate);
    let result: JsonValue;
    if (Array.isArray(candidate)) {
      if (Object.getPrototypeOf(candidate) !== Array.prototype) {
        throw new TypeError(`${candidatePath} must be a plain JSON array.`);
      }
      for (const key of Reflect.ownKeys(candidate)) {
        if (key === "length") continue;
        if (
          typeof key === "symbol" ||
          !/^(?:0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= candidate.length
        ) {
          throw new TypeError(
            `${candidatePath} must not contain non-index array properties.`,
          );
        }
      }
      const values: JsonValue[] = [];
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, index);
        if (!descriptor) {
          if (undefinedPolicy === "json-compatible") {
            values.push(null);
            continue;
          }
          throw new TypeError(`${jsonPath(candidatePath, index)} must exist.`);
        }
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError(
            `${jsonPath(candidatePath, index)} must be an enumerable data property.`,
          );
        }
        values.push(snapshot(descriptor.value, jsonPath(candidatePath, index)));
      }
      result = values;
    } else {
      const prototype = Object.getPrototypeOf(candidate) as object | null;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${candidatePath} must be a plain JSON object.`);
      }
      const entries: Array<readonly [string, JsonValue]> = [];
      for (const key of Reflect.ownKeys(candidate)) {
        if (typeof key === "symbol") {
          throw new TypeError(`${candidatePath} must not contain symbol keys.`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new TypeError(
            `${jsonPath(candidatePath, key)} must be an enumerable data property.`,
          );
        }
        if (descriptor.value !== undefined || undefinedPolicy === "reject") {
          entries.push([
            key,
            snapshot(descriptor.value, jsonPath(candidatePath, key)),
          ]);
        }
      }
      result = Object.fromEntries(entries) as Readonly<
        Record<string, JsonValue>
      >;
    }
    ancestors.delete(candidate);
    return result;
  }

  return snapshot(value, path);
}

function snapshotJsonValue(value: unknown, path = "$"): JsonValue {
  return normalizeJsonValue(value, path, "reject");
}

export function assertJsonValue(
  value: unknown,
  path = "$",
): asserts value is JsonValue {
  snapshotJsonValue(value, path);
}

function encodeCanonicalJson(candidate: JsonValue): string {
  if (candidate === null || typeof candidate !== "object") {
    return JSON.stringify(candidate);
  }
  if (Array.isArray(candidate)) {
    return `[${candidate.map(encodeCanonicalJson).join(",")}]`;
  }
  return `{${Object.keys(candidate)
    .sort(compareCodeUnits)
    .map(
      (key) =>
        `${JSON.stringify(key)}:${encodeCanonicalJson(
          (candidate as Readonly<Record<string, JsonValue>>)[key] as JsonValue,
        )}`,
    )
    .join(",")}}`;
}

export function canonicalJson(value: JsonValue): string {
  return encodeCanonicalJson(snapshotJsonValue(value));
}

/**
 * Canonicalizes migration comparison data received at an untyped boundary.
 * Undefined values become null at the root and in arrays, including sparse
 * array holes; undefined object properties are omitted. Only JSON primitives,
 * plain arrays, and plain objects are accepted. Accessors, custom prototypes,
 * symbol keys, non-index array properties, non-enumerable data properties,
 * functions, symbols, bigints, non-finite numbers, and cycles are rejected.
 */
export function canonicalJsonFromUnknown(value: unknown): string {
  return encodeCanonicalJson(normalizeJsonValue(value, "$", "json-compatible"));
}

export function cloneJson<T extends JsonValue>(value: T): T {
  return snapshotJsonValue(value) as T;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertIdentitySegment(value: string, path: string): void {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string.`);
  }
  if (value.normalize("NFC") !== value) {
    throw new TypeError(`${path} must already use Unicode NFC normalization.`);
  }
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function rotateRight(value: number, shift: number): number {
  return ((value >>> shift) | (value << (32 - shift))) >>> 0;
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(value: string | Uint8Array): `sha256:${string}` {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const input = new Uint8Array(paddedLength);
  input.set(bytes);
  input[bytes.length] = 0x80;
  const view = new DataView(input.buffer);
  const bitLength = BigInt(bytes.length) * 8n;
  view.setUint32(paddedLength - 8, Number(bitLength >> 32n), false);
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffff_ffffn), false);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15] as number;
      const previous2 = words[index - 2] as number;
      const sigma0 =
        rotateRight(previous15, 7) ^
        rotateRight(previous15, 18) ^
        (previous15 >>> 3);
      const sigma1 =
        rotateRight(previous2, 17) ^
        rotateRight(previous2, 19) ^
        (previous2 >>> 10);
      words[index] =
        ((words[index - 16] as number) +
          sigma0 +
          (words[index - 7] as number) +
          sigma1) >>>
        0;
    }

    let a = state[0] as number;
    let b = state[1] as number;
    let c = state[2] as number;
    let d = state[3] as number;
    let e = state[4] as number;
    let f = state[5] as number;
    let g = state[6] as number;
    let h = state[7] as number;

    for (let index = 0; index < 64; index += 1) {
      const sigma1 =
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 =
        (h +
          sigma1 +
          choice +
          (SHA256_CONSTANTS[index] as number) +
          (words[index] as number)) >>>
        0;
      const sigma0 =
        rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    state[0] = ((state[0] as number) + a) >>> 0;
    state[1] = ((state[1] as number) + b) >>> 0;
    state[2] = ((state[2] as number) + c) >>> 0;
    state[3] = ((state[3] as number) + d) >>> 0;
    state[4] = ((state[4] as number) + e) >>> 0;
    state[5] = ((state[5] as number) + f) >>> 0;
    state[6] = ((state[6] as number) + g) >>> 0;
    state[7] = ((state[7] as number) + h) >>> 0;
  }

  const hex = [...state]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
  return `sha256:${hex}`;
}

export function isSha256Digest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function sha1(bytes: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const input = new Uint8Array(paddedLength);
  input.set(bytes);
  input[bytes.length] = 0x80;
  const view = new DataView(input.buffer);
  const bitLength = BigInt(bytes.length) * 8n;
  view.setUint32(paddedLength - 8, Number(bitLength >> 32n), false);
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffff_ffffn), false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(
        (words[index - 3] as number) ^
          (words[index - 8] as number) ^
          (words[index - 14] as number) ^
          (words[index - 16] as number),
        1,
      );
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temporary =
        (rotateLeft(a, 5) + f + e + k + (words[index] as number)) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temporary;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  [h0, h1, h2, h3, h4].forEach((word, index) => {
    digestView.setUint32(index * 4, word, false);
  });
  return digest;
}

function uuidBytes(uuid: string): Uint8Array {
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      uuid,
    )
  ) {
    throw new TypeError("UUID namespace must be a canonical 16-byte UUID.");
  }
  const compact = uuid.replaceAll("-", "");
  return Uint8Array.from(compact.match(/.{2}/g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
}

export function uuidV5(
  name: string,
  namespace: string = DOCUMENT_MODEL_IDENTITY_NAMESPACE,
): string {
  const namespaceBytes = uuidBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);
  const bytes = sha1(input).slice(0, 16);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function deriveDefinitionId(
  documentType: string,
  kind: IdentityKind,
  ...segments: readonly string[]
): string {
  const segmentCounts: Readonly<Record<IdentityKind, number>> = {
    module: 1,
    operation: 2,
    error: 3,
    "state-example": 2,
    "operation-example": 3,
  };
  if (segments.length !== segmentCounts[kind]) {
    throw new TypeError(
      `${kind} identity requires ${segmentCounts[kind]} segment${segmentCounts[kind] === 1 ? "" : "s"}.`,
    );
  }
  assertIdentitySegment(documentType, "documentType");
  segments.forEach((segment, index) =>
    assertIdentitySegment(segment, `segments[${index}]`),
  );
  const tuple: JsonValue = [
    "powerhouse.document-model.identity",
    1,
    documentType,
    kind,
    ...segments,
  ];
  return uuidV5(canonicalJson(tuple));
}
