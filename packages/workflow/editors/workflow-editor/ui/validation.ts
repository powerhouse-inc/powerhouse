// Lean required-field check shared by the property form, the side panel
// header and the canvas badge. No schema validation: {{}} values defeat it.
import type { BlockForm, BlockFormProp } from "./forms.js";

export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// Display names of required props with no value; MARKDOWN is informational.
export function missingRequired(
  props: BlockFormProp[],
  config: unknown,
): string[] {
  const record =
    config !== null && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  return props
    .filter(
      (prop) =>
        prop.required &&
        prop.type !== "MARKDOWN" &&
        isEmptyValue(record[prop.name] ?? prop.defaultValue),
    )
    .map((prop) => prop.displayName);
}

// Everything a block still needs before it can run; a loading (or unknown)
// form counts as complete so async fetches never flash warnings.
export function missingForBlock(
  form: BlockForm | null | "loading" | undefined,
  config: unknown,
  connectionId: string | null | undefined,
): string[] {
  if (!form || form === "loading") return [];
  const missing = missingRequired(form.props, config);
  if (form.auth === "required" && !connectionId) missing.unshift("Connection");
  return missing;
}
