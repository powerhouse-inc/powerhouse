import { tokenSchema, type OutputPath } from "../tokens.js";
import {
  collectTokenSites,
  describeToken,
  formatPath,
  isPlainObject,
  type TokenSite,
} from "./walk.js";

/**
 * Declared validation (pipeline step 3) of a host's tokens, before anything
 * runs: operator shapes, `$env` `optional` placement, and every `$output`
 * path against the producer's `outputsSchema`. No environment value is read
 * and no producer needs to be running. Pure: producers are looked up through
 * a callback the node side fills.
 */

/** Which host's outputs a `$output` token names: `host` is the producer's
 * FOLDER (`hosts/<host>/`); `member` picks one compound member when two
 * share a host. */
export interface OutputRef {
  host: string;
  member?: string;
}

export interface DeclaredIssue {
  /** Host path of the token (`runner.plugins[0].config.drive`). */
  path: string;
  message: string;
}

/** The operators T3 resolves. `$map`, `$item` and `$key` arrive in T4. */
const NOT_YET = new Set(["$map", "$item", "$key"]);

function refOf(site: TokenSite): OutputRef | undefined {
  const operand = site.token.$output;
  if (!isPlainObject(operand) || typeof operand.host !== "string") {
    return undefined;
  }
  return typeof operand.member === "string"
    ? { host: operand.host, member: operand.member }
    : { host: operand.host };
}

function pathOf(site: TokenSite): OutputPath {
  const operand = site.token.$output;
  if (!isPlainObject(operand) || !Array.isArray(operand.path)) return [];
  return operand.path.filter(
    (p): p is string | number => typeof p === "string" || typeof p === "number",
  );
}

export function refKey(ref: OutputRef): string {
  return ref.member ? `${ref.host}#${ref.member}` : ref.host;
}

/** The distinct producers a host's `$output` tokens name, in document order. */
export function outputRefsOf(host: unknown): OutputRef[] {
  const seen = new Map<string, OutputRef>();
  for (const site of collectTokenSites(host)) {
    if (site.key !== "$output") continue;
    const ref = refOf(site);
    if (ref && !seen.has(refKey(ref))) seen.set(refKey(ref), ref);
  }
  return [...seen.values()];
}

/** Every `$output` token with its host path and producer (for the plan and
 * `--explain outputs`). */
export function outputSitesOf(
  host: unknown,
): { path: string; ref: OutputRef; outputPath: OutputPath }[] {
  return collectTokenSites(host).flatMap((site) => {
    if (site.key !== "$output") return [];
    const ref = refOf(site);
    return ref
      ? [{ path: formatPath(site.path), ref, outputPath: pathOf(site) }]
      : [];
  });
}

/** Every `$env` token with its host path (for `--explain outputs`). */
export function envSitesOf(
  host: unknown,
): { path: string; name: string; optional: boolean }[] {
  return collectTokenSites(host).flatMap((site): {
    path: string;
    name: string;
    optional: boolean;
  }[] => {
    if (site.key !== "$env") return [];
    const operand = site.token.$env;
    if (typeof operand === "string") {
      return [{ path: formatPath(site.path), name: operand, optional: false }];
    }
    if (isPlainObject(operand) && typeof operand.name === "string") {
      return [
        { path: formatPath(site.path), name: operand.name, optional: true },
      ];
    }
    return [];
  });
}

/** Operator shapes and placement: malformed operands, operators T3 does not
 * resolve, and `{ $env: { name, optional: true } }` anywhere but the direct
 * value of an object property (it omits that property when unset). */
export function checkTokenSites(host: unknown): DeclaredIssue[] {
  const issues: DeclaredIssue[] = [];
  for (const site of collectTokenSites(host)) {
    const path = formatPath(site.path);
    if (NOT_YET.has(site.key)) {
      issues.push({
        path,
        message: `${site.key} is not supported yet (it arrives with $map); spell the value with $output/$concat.`,
      });
      continue;
    }
    if (!tokenSchema.safeParse(site.token).success) {
      issues.push({
        path,
        message: `malformed ${site.key} token ${JSON.stringify(site.token)}. Shapes: { $output: { host, member?, path: [...] } }, { $concat: [string | number | token, ...] }, { $env: "NAME" } or { $env: { name: "NAME", optional: true } }.`,
      });
      continue;
    }
    const operand = site.token.$env;
    if (
      site.key === "$env" &&
      isPlainObject(operand) &&
      site.position !== "property"
    ) {
      const where =
        site.position === "concat"
          ? "a $concat part"
          : site.position === "element"
            ? "an array element"
            : "the whole host";
      issues.push({
        path,
        message: `{ $env: { name, optional: true } } is legal only as the direct value of an object property (it omits that property when ${String(operand.name)} is unset), not as ${where}. Use { $env: ${JSON.stringify(operand.name)} } here.`,
      });
    }
  }
  return issues;
}

/* ------------------------------------------------------- output path check */

/** What a producer lookup yields: its runner's `outputsSchema` (any zod
 * instance), or why there is none. */
export type OutputsSchemaLookup =
  | { schema: unknown; label: string }
  | { error: string };

type ZodDef = Record<string, unknown> & { type: string };

function defOf(schema: unknown): ZodDef | undefined {
  if (!isPlainObjectLike(schema)) return undefined;
  const internals = schema._zod;
  if (!isPlainObjectLike(internals)) return undefined;
  const def = internals.def;
  if (!isPlainObjectLike(def) || typeof def.type !== "string") return undefined;
  return { ...def, type: def.type };
}

// zod schemas are class instances, so "plain object" is too strict here.
function isPlainObjectLike(value: unknown): value is Record<string, unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null
  );
}

const WRAPPERS = new Set([
  "optional",
  "nullable",
  "default",
  "prefault",
  "readonly",
  "nonoptional",
  "catch",
  "success",
]);

/** The schema at `path` inside a zod schema (walking objects, records,
 * arrays, tuples, unions and wrappers), or why the path does not exist. */
export function schemaAtPath(
  schema: unknown,
  path: OutputPath,
):
  | { ok: true; schema: unknown }
  | { ok: false; at: number; reason: string } {
  let current = schema;
  for (let i = 0; i <= path.length; i++) {
    // unwrap
    for (let guard = 0; guard < 32; guard++) {
      const def = defOf(current);
      if (!def) break;
      if (WRAPPERS.has(def.type)) current = def.innerType;
      else if (def.type === "lazy" && typeof def.getter === "function") {
        const getter = def.getter as () => unknown;
        current = getter();
      } else if (def.type === "pipe") {
        const out = defOf(def.out);
        current = out && out.type !== "transform" ? def.out : def.in;
      } else break;
    }
    if (i === path.length) return { ok: true, schema: current };
    const segment = path[i];
    const def = defOf(current);
    if (!def) return { ok: false, at: i, reason: "is not a schema" };
    switch (def.type) {
      case "any":
      case "unknown":
        return { ok: true, schema: current };
      case "object": {
        const shape = isPlainObjectLike(def.shape) ? def.shape : {};
        if (typeof segment === "string" && segment in shape) {
          current = shape[segment];
          break;
        }
        const catchall = defOf(def.catchall);
        if (catchall && catchall.type !== "never") {
          current = def.catchall;
          break;
        }
        const keys = Object.keys(shape);
        return {
          ok: false,
          at: i,
          reason: `has no key ${JSON.stringify(segment)} (keys: ${keys.join(", ") || "none"})`,
        };
      }
      case "record":
        if (typeof segment !== "string") {
          return { ok: false, at: i, reason: "is a record (string keys)" };
        }
        current = def.valueType;
        break;
      case "array":
        if (typeof segment !== "number") {
          return { ok: false, at: i, reason: "is an array (numeric index)" };
        }
        current = def.element;
        break;
      case "tuple": {
        const items = Array.isArray(def.items) ? def.items : [];
        if (typeof segment !== "number" || segment >= items.length) {
          return { ok: false, at: i, reason: `is a ${items.length}-tuple` };
        }
        current = items[segment];
        break;
      }
      case "union": {
        const options = Array.isArray(def.options) ? def.options : [];
        for (const option of options) {
          const hit = schemaAtPath(option, path.slice(i));
          if (hit.ok) return hit;
        }
        return { ok: false, at: i, reason: "matches no union member" };
      }
      default:
        return { ok: false, at: i, reason: `is a ${def.type}, not a container` };
    }
  }
  return { ok: true, schema: current };
}

/** Every `$output` token's producer exists and its path is valid against
 * the producer's `outputsSchema`. */
export function checkOutputPaths(
  host: unknown,
  outputsSchemaOf: (ref: OutputRef) => OutputsSchemaLookup,
): DeclaredIssue[] {
  const issues: DeclaredIssue[] = [];
  for (const site of collectTokenSites(host)) {
    if (site.key !== "$output" || !tokenSchema.safeParse(site.token).success) {
      continue;
    }
    const ref = refOf(site);
    if (!ref) continue;
    const path = formatPath(site.path);
    const lookup = outputsSchemaOf(ref);
    if ("error" in lookup) {
      issues.push({ path, message: lookup.error });
      continue;
    }
    const outputPath = pathOf(site);
    const hit = schemaAtPath(lookup.schema, outputPath);
    if (!hit.ok) {
      const parent = outputPath.slice(0, hit.at);
      const where = parent.length
        ? `outputs.${formatPath(parent)}`
        : "the outputs";
      issues.push({
        path,
        message: `${describeToken(site.token)}: ${where} ${hit.reason} in the outputsSchema of ${lookup.label}.`,
      });
    }
  }
  return issues;
}
