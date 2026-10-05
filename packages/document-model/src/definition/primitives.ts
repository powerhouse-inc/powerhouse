import type { Sha256Digest } from "@powerhousedao/shared/document-model";

function memberPath(parent: string, key: string | number): string {
  if (typeof key === "number") {
    return `${parent}[${key}]`;
  }
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function encodeProperty(
  descriptor: PropertyDescriptor,
  path: string,
  ancestors: Set<object>,
): string {
  if (!("value" in descriptor)) {
    throw new TypeError(`${path} must be a data property, not an accessor.`);
  }
  if (descriptor.enumerable !== true) {
    throw new TypeError(`${path} must be enumerable.`);
  }
  return encode(descriptor.value, path, ancestors);
}

function encodeArray(
  value: readonly unknown[],
  path: string,
  ancestors: Set<object>,
): string {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${path} must be a plain array.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") {
      continue;
    }
    if (typeof key === "symbol") {
      throw new TypeError(`${path} must not have symbol keys.`);
    }
    if (!/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) {
      throw new TypeError(
        `${path} must not have a non-index property ${JSON.stringify(key)}.`,
      );
    }
  }
  const members: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined) {
      throw new TypeError(
        `${memberPath(path, index)} must not be an array hole.`,
      );
    }
    members.push(
      encodeProperty(descriptor, memberPath(path, index), ancestors),
    );
  }
  return `[${members.join(",")}]`;
}

function encodeObject(
  value: object,
  path: string,
  ancestors: Set<object>,
): string {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must be a plain object.`);
  }
  const keys: string[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new TypeError(`${path} must not have symbol keys.`);
    }
    keys.push(key);
  }
  keys.sort(compareCodeUnits);
  const members: string[] = [];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
      throw new TypeError(`${memberPath(path, key)} must be an own property.`);
    }
    members.push(
      `${JSON.stringify(key)}:${encodeProperty(descriptor, memberPath(path, key), ancestors)}`,
    );
  }
  return `{${members.join(",")}}`;
}

function encode(value: unknown, path: string, ancestors: Set<object>): string {
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (Number.isFinite(value)) {
        return JSON.stringify(value);
      }
      throw new TypeError(`${path} must be a finite number.`);
    case "object": {
      if (value === null) {
        return "null";
      }
      if (ancestors.has(value)) {
        throw new TypeError(`${path} must not contain a cycle.`);
      }
      ancestors.add(value);
      const encoded = Array.isArray(value)
        ? encodeArray(value, path, ancestors)
        : encodeObject(value, path, ancestors);
      ancestors.delete(value);
      return encoded;
    }
    default:
      throw new TypeError(
        `${path} must be a JSON value, received ${typeof value}.`,
      );
  }
}

export function canonicalJson(value: unknown): string {
  return encode(value, "$", new Set());
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

export function sha256(value: string | Uint8Array): Sha256Digest {
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
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 =
        rotateRight(previous15, 7) ^
        rotateRight(previous15, 18) ^
        (previous15 >>> 3);
      const sigma1 =
        rotateRight(previous2, 17) ^
        rotateRight(previous2, 19) ^
        (previous2 >>> 10);
      words[index] =
        (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];

    for (let index = 0; index < 64; index += 1) {
      const sigma1 =
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 =
        (h + sigma1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
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

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  const hex = [...state]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
  return `sha256:${hex}`;
}

export function canonicalDigest(value: unknown): Sha256Digest {
  return sha256(canonicalJson(value));
}

export function isSha256Digest(value: unknown): value is Sha256Digest {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

export function compareCodeUnits(a: string, b: string): -1 | 0 | 1 {
  // ECMA-262 IsLessThan compares strings by UTF-16 code unit, never by locale.
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The member an explicit empty input projects. The SDL printer and the
 * validator have to agree on it, so it is declared once, here.
 */
export const EMPTY_INPUT_FIELD_NAME = "_empty";

export function isGraphQLName(value: unknown): value is string {
  return typeof value === "string" && /^[_A-Za-z][_0-9A-Za-z]*$/.test(value);
}

export function isAuthoredSchemaName(value: unknown): value is string {
  return isGraphQLName(value) && !value.startsWith("__");
}

export function isEnumValueName(value: unknown): value is string {
  return (
    isAuthoredSchemaName(value) &&
    value !== "true" &&
    value !== "false" &&
    value !== "null"
  );
}

export function isNFC(value: string): boolean {
  return value.normalize("NFC") === value;
}

/**
 * Stops work that has already been cancelled, with a stable `AbortError`.
 *
 * A caller distinguishes cancellation from failure by the name, so the name is
 * fixed here rather than left to whatever each call site happens to construct.
 */
export function throwIfAborted(
  signal: AbortSignal | undefined,
  what: string,
): void {
  if (signal?.aborted !== true) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error(`${what} was aborted.`);
  error.name = "AbortError";
  throw error;
}
