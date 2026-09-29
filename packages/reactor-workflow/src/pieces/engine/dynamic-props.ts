// A DYNAMIC prop's children are resolved at design time and stored beside the
// step as `propertySettings[].schema`; the run checks the value against them.
import type { PropertySettingDef } from "./types.js";

// Non-retryable: the config has to change before the step can succeed.
export class DynamicPropertiesError extends Error {
  constructor(
    message: string,
    readonly prop: string,
    readonly missing: string[],
  ) {
    super(message);
    this.name = "DynamicPropertiesError";
  }
}

interface ChildProp {
  name: string;
  label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Accepts the piece's own props map or the editor's descriptor list.
function requiredChildren(schema: unknown): ChildProp[] {
  const entries: [string, unknown][] = Array.isArray(schema)
    ? schema
        .filter(isRecord)
        .filter((entry) => typeof entry.name === "string")
        .map((entry) => [entry.name as string, entry])
    : isRecord(schema)
      ? Object.entries(schema)
      : [];
  return entries
    .filter(([, prop]) => isRecord(prop) && prop.required === true)
    .map(([name, prop]) => {
      const displayName = (prop as Record<string, unknown>).displayName;
      return {
        name,
        label:
          typeof displayName === "string" && displayName !== ""
            ? `${displayName} (${name})`
            : name,
      };
    });
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** Throws a DynamicPropertiesError naming the first prop whose value does not
 * satisfy its resolved children. Settings without a schema are ignored. */
export function checkDynamicProperties(
  config: unknown,
  settings: readonly PropertySettingDef[] | null | undefined,
): void {
  if (!settings || settings.length === 0) return;
  const values = isRecord(config) ? config : {};
  for (const setting of settings) {
    if (setting.schema === undefined || setting.schema === null) continue;
    const raw = values[setting.prop];
    if (!isBlank(raw) && !isRecord(raw)) {
      throw new DynamicPropertiesError(
        `Property "${setting.prop}" must be an object of fields, received ${Array.isArray(raw) ? "array" : typeof raw}`,
        setting.prop,
        [],
      );
    }
    const value = isRecord(raw) ? raw : {};
    const missing = requiredChildren(setting.schema).filter((child) =>
      isBlank(value[child.name]),
    );
    if (missing.length > 0) {
      throw new DynamicPropertiesError(
        `Property "${setting.prop}" is missing required fields: ${missing.map((child) => child.label).join(", ")}`,
        setting.prop,
        missing.map((child) => child.name),
      );
    }
  }
}
