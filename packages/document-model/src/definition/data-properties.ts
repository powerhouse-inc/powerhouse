export type DataPath = readonly (string | number)[];

export type DataLeaf = string | number | boolean | bigint | null | undefined;

export type DataValue =
  | DataLeaf
  | readonly DataValue[]
  | { readonly [key: string]: DataValue };

export type DataSnapshotRejection =
  | {
      readonly ok: false;
      readonly reason: "not-record";
      readonly path: DataPath;
    }
  | {
      readonly ok: false;
      readonly reason: "not-array";
      readonly path: DataPath;
    }
  | {
      readonly ok: false;
      readonly reason: "custom-prototype";
      readonly path: DataPath;
    }
  | {
      readonly ok: false;
      readonly reason: "symbol-key";
      readonly path: DataPath;
      readonly key: symbol;
    }
  | {
      readonly ok: false;
      readonly reason: "unknown-key";
      readonly path: DataPath;
      readonly key: string;
      readonly allowedKeys: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: "accessor";
      readonly path: DataPath;
      readonly key: string | number;
    }
  | {
      readonly ok: false;
      readonly reason: "non-enumerable";
      readonly path: DataPath;
      readonly key: string | number;
    }
  | {
      readonly ok: false;
      readonly reason: "sparse";
      readonly path: DataPath;
      readonly key: number;
    }
  | {
      readonly ok: false;
      readonly reason: "array-property";
      readonly path: DataPath;
      readonly key: string;
    }
  | { readonly ok: false; readonly reason: "cycle"; readonly path: DataPath }
  | { readonly ok: false; readonly reason: "not-data"; readonly path: DataPath }
  | {
      readonly ok: false;
      readonly reason: "inspection-failed";
      readonly path: DataPath;
    };

export type DataSnapshot<T> =
  | { readonly ok: true; readonly value: T }
  | DataSnapshotRejection;

const CANONICAL_INDEX = /^(?:0|[1-9][0-9]*)$/;

/**
 * Snapshots a plain object of JSON-like data. `allowedKeys` closes the member
 * set; `undefined` accepts any string key, which is what an author-supplied
 * map keyed by path needs.
 */
export function snapshotDataRecord(
  value: unknown,
  allowedKeys: readonly string[] | undefined,
  path: DataPath,
): DataSnapshot<{ readonly [key: string]: DataValue }> {
  return snapshotPlainObject(
    value,
    allowedKeys,
    path,
    snapshotDataValue,
    new Set(),
  );
}

export function snapshotDataArray(
  value: unknown,
  path: DataPath,
): DataSnapshot<readonly DataValue[]> {
  return snapshotArrayValue(value, path, snapshotDataValue, new Set());
}

export function snapshotArray(
  value: unknown,
  path: DataPath,
): DataSnapshot<readonly unknown[]> {
  return snapshotArrayValue<unknown>(
    value,
    path,
    (member) => ({ ok: true, value: member }),
    new Set(),
  );
}

type MemberSnapshot<T> = (
  value: unknown,
  path: DataPath,
  ancestors: Set<object>,
) => DataSnapshot<T>;

function snapshotArrayValue<T>(
  value: unknown,
  path: DataPath,
  member: MemberSnapshot<T>,
  ancestors: Set<object>,
): DataSnapshot<readonly T[]> {
  try {
    if (!Array.isArray(value)) {
      return { ok: false, reason: "not-array", path };
    }
  } catch {
    return { ok: false, reason: "inspection-failed", path };
  }
  if (ancestors.has(value)) {
    return { ok: false, reason: "cycle", path };
  }
  ancestors.add(value);
  try {
    return snapshotArrayMembers(value, path, member, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function snapshotArrayMembers<T>(
  value: readonly unknown[],
  path: DataPath,
  member: MemberSnapshot<T>,
  ancestors: Set<object>,
): DataSnapshot<readonly T[]> {
  let prototype: unknown;
  let keys: readonly (string | symbol)[];
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  } catch {
    return { ok: false, reason: "inspection-failed", path };
  }
  if (prototype !== Array.prototype) {
    return { ok: false, reason: "custom-prototype", path };
  }
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor)) {
    return { ok: false, reason: "not-array", path };
  }
  const length: unknown = lengthDescriptor.value;
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0
  ) {
    return { ok: false, reason: "not-array", path };
  }
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key === "symbol") {
      return { ok: false, reason: "symbol-key", path, key };
    }
    if (!CANONICAL_INDEX.test(key) || Number(key) >= length) {
      return { ok: false, reason: "array-property", path: [...path, key], key };
    }
  }
  const elements: T[] = [];
  for (let index = 0; index < length; index += 1) {
    const elementPath = [...path, index];
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, index);
    } catch {
      return { ok: false, reason: "inspection-failed", path: elementPath };
    }
    if (descriptor === undefined) {
      return { ok: false, reason: "sparse", path: elementPath, key: index };
    }
    const propertyValue = dataPropertyValue(descriptor, index, elementPath);
    if (!propertyValue.ok) return propertyValue;
    const element = member(propertyValue.value, elementPath, ancestors);
    if (!element.ok) return element;
    elements.push(element.value);
  }
  return { ok: true, value: Object.freeze(elements) };
}

/**
 * Snapshots a plain object whose members stay opaque. `allowedKeys` closes the
 * member set; `undefined` accepts any string key, which is what a consumer
 * inspecting a value it did not build needs.
 */
export function snapshotRecord(
  value: unknown,
  allowedKeys: readonly string[] | undefined,
  path: DataPath,
): DataSnapshot<{ readonly [key: string]: unknown }> {
  return snapshotPlainObject<unknown>(
    value,
    allowedKeys,
    path,
    (member) => ({ ok: true, value: member }),
    new Set(),
  );
}

function snapshotPlainObject<T>(
  value: unknown,
  allowedKeys: readonly string[] | undefined,
  path: DataPath,
  member: (
    value: unknown,
    path: DataPath,
    ancestors: Set<object>,
  ) => DataSnapshot<T>,
  ancestors: Set<object>,
): DataSnapshot<{ readonly [key: string]: T }> {
  if (value === null || typeof value !== "object") {
    return { ok: false, reason: "not-record", path };
  }
  if (ancestors.has(value)) {
    return { ok: false, reason: "cycle", path };
  }
  ancestors.add(value);
  try {
    return snapshotPlainObjectMembers(
      value,
      allowedKeys,
      path,
      member,
      ancestors,
    );
  } finally {
    ancestors.delete(value);
  }
}

function snapshotPlainObjectMembers<T>(
  value: object,
  allowedKeys: readonly string[] | undefined,
  path: DataPath,
  member: (
    value: unknown,
    path: DataPath,
    ancestors: Set<object>,
  ) => DataSnapshot<T>,
  ancestors: Set<object>,
): DataSnapshot<{ readonly [key: string]: T }> {
  let prototype: unknown;
  let keys: readonly (string | symbol)[];
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    return { ok: false, reason: "inspection-failed", path };
  }
  if (prototype !== Object.prototype && prototype !== null) {
    return { ok: false, reason: "custom-prototype", path };
  }
  const entries: [string, T][] = [];
  for (const key of keys) {
    if (typeof key === "symbol") {
      return { ok: false, reason: "symbol-key", path, key };
    }
    const memberPath = [...path, key];
    if (allowedKeys !== undefined && !allowedKeys.includes(key)) {
      return {
        ok: false,
        reason: "unknown-key",
        path: memberPath,
        key,
        allowedKeys,
      };
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return { ok: false, reason: "inspection-failed", path: memberPath };
    }
    if (descriptor === undefined) {
      return { ok: false, reason: "inspection-failed", path: memberPath };
    }
    const propertyValue = dataPropertyValue(descriptor, key, memberPath);
    if (!propertyValue.ok) return propertyValue;
    const snapshot = member(propertyValue.value, memberPath, ancestors);
    if (!snapshot.ok) return snapshot;
    entries.push([key, snapshot.value]);
  }
  // `Object.fromEntries` defines own properties, so an own "__proto__" key stays
  // an own key instead of silently becoming the prototype as plain assignment would.
  return { ok: true, value: Object.freeze(Object.fromEntries(entries)) };
}

function dataPropertyValue(
  descriptor: PropertyDescriptor,
  key: string | number,
  path: DataPath,
): DataSnapshot<unknown> {
  if (!("value" in descriptor)) {
    return { ok: false, reason: "accessor", path, key };
  }
  if (!descriptor.enumerable) {
    return { ok: false, reason: "non-enumerable", path, key };
  }
  const value: unknown = descriptor.value;
  return { ok: true, value };
}

function snapshotDataValue(
  value: unknown,
  path: DataPath,
  ancestors: Set<object>,
): DataSnapshot<DataValue> {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
    case "undefined":
      return { ok: true, value };
    case "function":
    case "symbol":
      return { ok: false, reason: "not-data", path };
    case "object": {
      if (value === null) return { ok: true, value };
      let isArray: boolean;
      try {
        isArray = Array.isArray(value);
      } catch {
        return { ok: false, reason: "inspection-failed", path };
      }
      return isArray
        ? snapshotArrayValue(value, path, snapshotDataValue, ancestors)
        : snapshotPlainObject(
            value,
            undefined,
            path,
            snapshotDataValue,
            ancestors,
          );
    }
  }
}
