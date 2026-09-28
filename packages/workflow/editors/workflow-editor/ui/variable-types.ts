// Typed workflow variables: what each type accepts and how typed text parses.
import type { VariableTypeValue } from "./model.js";

export const VARIABLE_TYPE_LABEL: Record<VariableTypeValue, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  BOOLEAN: "True or false",
  JSON: "JSON",
  SECRET: "Secret",
};

export const VARIABLE_TYPES = Object.keys(
  VARIABLE_TYPE_LABEL,
) as VariableTypeValue[];

export type Parsed =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

// Typed text to a value of that type, or why it isn't one. Never coerces.
export function parseTypedValue(type: VariableTypeValue, raw: string): Parsed {
  const trimmed = raw.trim();
  switch (type) {
    case "TEXT":
      return { ok: true, value: raw === "" ? null : raw };
    case "NUMBER":
      if (trimmed === "") return { ok: true, value: null };
      return DECIMAL.test(trimmed)
        ? { ok: true, value: Number(trimmed) }
        : { ok: false, error: "Not a number" };
    case "BOOLEAN":
      if (trimmed === "true") return { ok: true, value: true };
      if (trimmed === "false") return { ok: true, value: false };
      return { ok: false, error: "Not true or false" };
    case "JSON":
      if (trimmed === "") return { ok: true, value: null };
      try {
        return { ok: true, value: JSON.parse(trimmed) as unknown };
      } catch (error) {
        return {
          ok: false,
          error: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    case "SECRET":
      return { ok: false, error: "Secrets are set through the secret field" };
  }
}

// Whether a stored value fits its type; a mismatch is shown, never fixed.
export function valueMismatch(
  type: VariableTypeValue,
  value: unknown,
): string | null {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "TEXT":
      return typeof value === "string" ? null : "Not text";
    case "NUMBER":
      return typeof value === "number" ? null : "Not a number";
    case "BOOLEAN":
      return typeof value === "boolean" ? null : "Not true or false";
    case "JSON":
      return null;
    case "SECRET":
      return typeof value === "string" ? null : "Not a secret reference";
  }
}

// The value carried over to a new type, where it converts without loss;
// a secret reference never becomes text, nor text a secret.
export function convertVariableValue(
  value: unknown,
  from: VariableTypeValue,
  to: VariableTypeValue,
): unknown {
  if (from === to) return value;
  if (from === "SECRET" || to === "SECRET") return null;
  if (to === "JSON" || value === null || value === undefined)
    return value ?? null;
  if (to === "TEXT") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (typeof value === "string") {
    const parsed = parseTypedValue(to, value);
    if (parsed.ok) return parsed.value;
  }
  return value;
}
