import type { Sha256Digest } from "@powerhousedao/shared/document-model";
import { sha256 } from "./hashes.js";

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

export function canonicalDigest(value: unknown): Sha256Digest {
  return sha256(canonicalJson(value));
}

export function compareCodeUnits(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

const DIGIT_0 = 48;
const DIGIT_9 = 57;

function isDigit(code: number): boolean {
  return DIGIT_0 <= code && code <= DIGIT_9;
}

/**
 * graphql-js's `naturalCompare`, which `lexicographicSortSchema` sorts a
 * generated schema with: runs of digits compare as numbers, so `item2`
 * precedes `item10`. Copied, not imported, so a model never loads `graphql`.
 */
export function compareGeneratedOrder(a: string, b: string): number {
  let aIndex = 0;
  let bIndex = 0;
  while (aIndex < a.length && bIndex < b.length) {
    let aChar = a.charCodeAt(aIndex);
    let bChar = b.charCodeAt(bIndex);
    if (isDigit(aChar) && isDigit(bChar)) {
      let aNumber = 0;
      do {
        ++aIndex;
        aNumber = aNumber * 10 + aChar - DIGIT_0;
        aChar = a.charCodeAt(aIndex);
      } while (isDigit(aChar) && aNumber > 0);
      let bNumber = 0;
      do {
        ++bIndex;
        bNumber = bNumber * 10 + bChar - DIGIT_0;
        bChar = b.charCodeAt(bIndex);
      } while (isDigit(bChar) && bNumber > 0);
      if (aNumber !== bNumber) return aNumber < bNumber ? -1 : 1;
    } else {
      if (aChar !== bChar) return aChar < bChar ? -1 : 1;
      ++aIndex;
      ++bIndex;
    }
  }
  return a.length - b.length;
}

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
