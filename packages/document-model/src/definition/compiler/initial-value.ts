import type { JsonValue } from "@powerhousedao/shared/document-model";
import type { AnyTypeDescriptor } from "../dsl/types.js";

type InitialValueResult =
  | {
      readonly ok: true;
      readonly value: JsonValue;
      readonly serialized: string;
    }
  | {
      readonly ok: false;
      readonly reason: "not-serializable" | "rejected";
      readonly message: string;
    };

export function serializeAndValidateInitialValue(
  root: AnyTypeDescriptor,
  value: unknown,
): InitialValueResult {
  let serialized: string | undefined;
  try {
    // The lib signature omits that JSON.stringify returns undefined for
    // undefined, a function, or a symbol.
    serialized = JSON.stringify(value) as string | undefined;
  } catch (error) {
    return {
      ok: false,
      reason: "not-serializable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  if (serialized === undefined) {
    return {
      ok: false,
      reason: "not-serializable",
      message: `JSON.stringify returned undefined for a value of type ${typeof value}`,
    };
  }
  const parsed = JSON.parse(serialized) as JsonValue;
  try {
    root.validator.parse(parsed);
  } catch (error) {
    return {
      ok: false,
      reason: "rejected",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return { ok: true, value: parsed, serialized };
}
