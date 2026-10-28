import type { SwitchboardConfigInput } from "./schema.js";

type Layer = SwitchboardConfigInput;
type Section = Record<string, unknown>;

// A union, not a section: its variants do not share keys.
const REPLACED_WHOLE = new Set(["attachments.storage"]);

// The reactor-api auth keys whose env vars override a caller's option.
const ENV_WINS_AUTH = [
  "enabled",
  "admins",
  "resolveIdentity",
  "requireAuthenticatedCaller",
  "requireAuthenticatedCallerExemptPaths",
  "attachmentReadsFollowDocumentPolicy",
] as const;

function isPlainObject(value: unknown): value is Section {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function mergeSection(base: Section, over: Section, path: string): Section {
  const result: Section = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) continue;
    const at = path ? `${path}.${key}` : key;
    const current = result[key];
    result[key] =
      isPlainObject(value) && isPlainObject(current) && !REPLACED_WHOLE.has(at)
        ? mergeSection(current, value, at)
        : value;
  }
  return result;
}

/** Later layers win per key; arrays, maps and unions are replaced whole. */
export function mergeSwitchboardConfig(...layers: Layer[]): Layer {
  let merged: Section = {};
  for (const layer of layers) merged = mergeSection(merged, layer, "");
  return merged as Layer;
}

/** A caller's layer over the env's, keeping each key's pre-config precedence. */
export function callerOverEnv(env: Layer, caller: Layer): Layer {
  const merged = mergeSwitchboardConfig(env, caller);
  const features: Section = { ...merged.features };
  const inspection: Section = { ...merged.inspection };
  const auth: Section = { ...merged.auth };

  const envAuth: Section = env.auth ?? {};
  for (const key of ENV_WINS_AUTH) {
    if (envAuth[key] !== undefined) auth[key] = envAuth[key];
  }
  if (env.features?.documentModelSubgraphs !== undefined) {
    features.documentModelSubgraphs = env.features.documentModelSubgraphs;
  }
  if (env.features?.mcp === false || caller.features?.mcp === false) {
    features.mcp = false;
  }
  if (
    env.inspection?.enabled === false ||
    caller.inspection?.enabled === false
  ) {
    inspection.enabled = false;
  }
  // Under the plugin host a plugin's presence decides these, not their env vars.
  if (features.pluginHost === true) {
    features.mcp = caller.features?.mcp;
    features.workflows = caller.features?.workflows;
  }

  return { ...merged, features, inspection, auth } as Layer;
}
