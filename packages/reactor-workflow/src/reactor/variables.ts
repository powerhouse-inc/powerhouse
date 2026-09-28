// Typed workflow variables, coerced when a run starts. An untyped variable
// passes through as authored.
import type { WorkflowVariable } from "@powerhousedao/workflow/document-models/workflow";
import type { SecretProvider, WorkflowVariableDef } from "../pieces/index.js";

export class VariableTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VariableTypeError";
  }
}

export interface ResolvedVariables {
  variables: WorkflowVariableDef[];
  // Plaintext of every SECRET variable, for the run's redaction pass.
  secretValues: string[];
}

type TypedVariable = Pick<WorkflowVariable, "key" | "value"> & {
  type?: WorkflowVariable["type"];
};

function isUnset(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function coerce(variable: TypedVariable): unknown {
  const { key, value, type } = variable;
  switch (type) {
    case "TEXT":
      if (value === undefined || value === null) return null;
      return typeof value === "object"
        ? JSON.stringify(value)
        : String(value as string | number | boolean);
    case "NUMBER": {
      if (isUnset(value)) return null;
      const number =
        typeof value === "string" ? Number(value.trim()) : Number(value);
      if (Number.isNaN(number)) {
        throw new VariableTypeError(
          `Variable "${key}" is a NUMBER, but its value ${JSON.stringify(value)} is not a number`,
        );
      }
      return number;
    }
    case "BOOLEAN": {
      if (isUnset(value)) return null;
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      const text = typeof value === "string" ? value.trim().toLowerCase() : "";
      if (text === "true" || text === "1") return true;
      if (text === "false" || text === "0") return false;
      throw new VariableTypeError(
        `Variable "${key}" is a BOOLEAN, but its value ${JSON.stringify(value)} is not true or false`,
      );
    }
    case "JSON":
      if (typeof value !== "string") return value ?? null;
      if (value.trim() === "") return null;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        throw new VariableTypeError(
          `Variable "${key}" is JSON, but its value does not parse`,
        );
      }
    default:
      return value ?? null;
  }
}

/** Coerces typed variables and resolves SECRET ones through the secret store.
 * The error for a SECRET names its ref, never a value. */
export async function resolveVariables(
  variables: readonly TypedVariable[],
  secrets: SecretProvider,
): Promise<ResolvedVariables> {
  const secretValues: string[] = [];
  const resolved: WorkflowVariableDef[] = [];
  for (const variable of variables) {
    if (variable.type !== "SECRET") {
      resolved.push({ key: variable.key, value: coerce(variable) });
      continue;
    }
    if (isUnset(variable.value)) {
      resolved.push({ key: variable.key, value: null });
      continue;
    }
    if (typeof variable.value !== "string") {
      throw new VariableTypeError(
        `Variable "${variable.key}" is a SECRET, but its value is not a secret reference`,
      );
    }
    let value: string;
    try {
      value = await secrets.get(variable.value);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new VariableTypeError(
        `Secret variable "${variable.key}" could not be resolved: ${detail}`,
      );
    }
    secretValues.push(value);
    resolved.push({ key: variable.key, value });
  }
  return { variables: resolved, secretValues };
}
