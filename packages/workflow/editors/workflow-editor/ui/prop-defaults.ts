// A new step, array item or resolved object stores its piece's defaults, so
// a run does not depend on whichever piece version supplies them later.
import type { BlockFormProp } from "./forms.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// `config` with every unset prop's defaultValue written in; set values win.
export function withPropDefaults(
  props: readonly BlockFormProp[],
  config: unknown,
): Record<string, unknown> {
  const next = { ...asRecord(config) };
  for (const prop of props) {
    if (prop.type === "MARKDOWN" || prop.defaultValue === undefined) continue;
    if (next[prop.name] === undefined) next[prop.name] = prop.defaultValue;
  }
  return next;
}

// Whether withPropDefaults would write anything into `config`.
export function lacksDefaults(
  props: readonly BlockFormProp[],
  config: unknown,
): boolean {
  const record = asRecord(config);
  return props.some(
    (prop) =>
      prop.type !== "MARKDOWN" &&
      prop.defaultValue !== undefined &&
      record[prop.name] === undefined,
  );
}
