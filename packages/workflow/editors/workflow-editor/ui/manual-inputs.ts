// The manual trigger's inputs as the run form draws them: each field as the
// piece property of its type, so PropertyForm renders it like any prop.
import {
  coerceManualPayload,
  manualDefault,
  ManualPayloadError,
  parseManualInputs,
  type ManualInput,
  type ManualInputType,
} from "@powerhousedao/pieces-framework/workflow";
import type { BlockFormProp } from "./forms.js";

export { coerceManualPayload, parseManualInputs, type ManualInput };

const PROPERTY_TYPES: Record<ManualInputType, string> = {
  text: "SHORT_TEXT",
  text_area: "LONG_TEXT",
  number: "NUMBER",
  toggle: "CHECKBOX",
  date: "DATE_TIME",
  dropdown: "STATIC_DROPDOWN",
  json: "JSON",
};

export function manualInputProp(input: ManualInput): BlockFormProp {
  const defaultValue = manualDefault(input);
  return {
    name: input.name,
    displayName: input.displayName,
    type: PROPERTY_TYPES[input.type],
    // An unchecked box is false, so a toggle always has a value.
    required: input.type === "toggle" ? false : input.required,
    ...(input.description ? { description: input.description } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(input.type === "dropdown"
      ? {
          staticOptions: (input.options ?? []).map(({ value, label }) => ({
            value,
            label,
          })),
        }
      : {}),
  };
}

// The form's values as the fire's payload; a refusal names fields by label.
export function manualRunPayload(
  inputs: readonly ManualInput[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  try {
    return coerceManualPayload(inputs, values);
  } catch (error) {
    if (!(error instanceof ManualPayloadError)) throw error;
    const label = (name: string) =>
      inputs.find((input) => input.name === name)?.displayName ?? name;
    throw new Error(
      error.fields
        .map((entry) => `${label(entry.field)} ${entry.message}`)
        .join("; "),
      { cause: error },
    );
  }
}

// The form's starting values: defaults, and false for an unset toggle.
export function manualInputValues(
  inputs: readonly ManualInput[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const input of inputs) {
    const value = manualDefault(input);
    if (value !== undefined) values[input.name] = value;
    else if (input.type === "toggle") values[input.name] = false;
  }
  return values;
}
