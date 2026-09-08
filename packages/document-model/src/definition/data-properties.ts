export type DataSnapshotFailure = {
  readonly ok: false;
  readonly reason:
    | "not-record"
    | "not-array"
    | "custom-prototype"
    | "inspection-failed"
    | "symbol-key"
    | "unstable-property"
    | "array-property";
  readonly key?: PropertyKey;
};

export type DataSnapshot<T> =
  | { readonly ok: true; readonly value: T }
  | DataSnapshotFailure;

export type DataRecordSnapshotOptions = {
  readonly allowFunction?: boolean;
  readonly allowCustomPrototype?: boolean;
  readonly ignoreNonEnumerable?: boolean;
};

/** Snapshots own enumerable data properties without invoking getters or iteration hooks. */
export function snapshotDataRecord(
  value: unknown,
  options: DataRecordSnapshotOptions = {},
): DataSnapshot<Readonly<Record<string, unknown>>> {
  if (
    value === null ||
    (typeof value !== "object" &&
      !(options.allowFunction && typeof value === "function"))
  ) {
    return { ok: false, reason: "not-record" };
  }
  try {
    if (Array.isArray(value)) return { ok: false, reason: "not-record" };
  } catch {
    return { ok: false, reason: "inspection-failed" };
  }
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
  } catch {
    return { ok: false, reason: "inspection-failed" };
  }
  if (
    !options.allowCustomPrototype &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    return { ok: false, reason: "custom-prototype" };
  }
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") {
      return { ok: false, reason: "symbol-key", key };
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return { ok: false, reason: "inspection-failed", key };
    }
    if (!descriptor) {
      return { ok: false, reason: "inspection-failed", key };
    }
    if (!descriptor.enumerable && options.ignoreNonEnumerable) continue;
    if (!descriptor.enumerable || !("value" in descriptor)) {
      return { ok: false, reason: "unstable-property", key };
    }
    result[key] = descriptor.value;
  }
  return { ok: true, value: Object.freeze(result) };
}

/** Snapshots a dense array without invoking index getters or custom iteration hooks. */
export function snapshotDataArray(
  value: unknown,
): DataSnapshot<readonly unknown[]> {
  try {
    if (!Array.isArray(value)) return { ok: false, reason: "not-array" };
  } catch {
    return { ok: false, reason: "inspection-failed" };
  }
  let keys: readonly PropertyKey[];
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    keys = Reflect.ownKeys(value);
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  } catch {
    return { ok: false, reason: "inspection-failed" };
  }
  if (
    !lengthDescriptor ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return { ok: false, reason: "inspection-failed", key: "length" };
  }
  const length = lengthDescriptor.value as number;
  for (const key of keys) {
    if (key === "length") continue;
    if (
      typeof key !== "string" ||
      !/^(?:0|[1-9][0-9]*)$/.test(key) ||
      Number(key) >= length
    ) {
      return { ok: false, reason: "array-property", key };
    }
  }
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, index);
    } catch {
      return { ok: false, reason: "inspection-failed", key: index };
    }
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      return { ok: false, reason: "unstable-property", key: index };
    }
    result.push(descriptor.value);
  }
  return { ok: true, value: Object.freeze(result) };
}
