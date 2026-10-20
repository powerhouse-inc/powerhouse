import { tokenSchema, type OutputPath } from "../tokens.js";
import {
  collectTokenSites,
  describeToken,
  formatPath,
  isPlainObject,
  type MapScope,
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
  return collectTokenSites(host).flatMap(
    (
      site,
    ): {
      path: string;
      name: string;
      optional: boolean;
    }[] => {
      if (site.key !== "$env") return [];
      const operand = site.token.$env;
      if (typeof operand === "string") {
        return [
          { path: formatPath(site.path), name: operand, optional: false },
        ];
      }
      if (isPlainObject(operand) && typeof operand.name === "string") {
        return [
          { path: formatPath(site.path), name: operand.name, optional: true },
        ];
      }
      return [];
    },
  );
}

/** The binding name an `$item`/`$key` site names (undefined: innermost). */
function bindingNameOf(site: TokenSite): string | undefined {
  const operand = site.token[site.key];
  if (site.key === "$key")
    return typeof operand === "string" ? operand : undefined;
  if (site.key === "$item" && isPlainObject(operand)) {
    return typeof operand.as === "string" ? operand.as : undefined;
  }
  return undefined;
}

/** The enclosing `$map` an `$item`/`$key` site binds to, or why none. */
function scopeOf(site: TokenSite): MapScope | { error: string } {
  const name = bindingNameOf(site);
  if (site.scopes.length === 0) {
    return {
      error: `${site.key} is used outside any $map; it reads the element a $map template is rendering, so it is legal only inside a $map's \`to\` (or a nested $map's \`over\`).`,
    };
  }
  if (name === undefined) return site.scopes[site.scopes.length - 1];
  for (let i = site.scopes.length - 1; i >= 0; i--) {
    if (site.scopes[i].as === name) return site.scopes[i];
  }
  const named = site.scopes.flatMap((s) => (s.as ? [`"${s.as}"`] : []));
  return {
    error: `${describeToken(site.token)} names the $map binding "${name}", which no enclosing $map declares (enclosing bindings: ${named.join(", ") || 'none; add as: "' + name + '" to the outer $map'}).`,
  };
}

/** Item path of an `$item` site. */
function itemPathOf(site: TokenSite): OutputPath {
  const operand = site.token.$item;
  const raw: unknown = isPlainObject(operand) ? operand.path : operand;
  return Array.isArray(raw)
    ? raw.filter(
        (p): p is string | number =>
          typeof p === "string" || typeof p === "number",
      )
    : [];
}

/** Operator shapes and placement: malformed operands, `$item`/`$key`
 * outside any `$map` or naming an unknown binding, and
 * `{ $env: { name, optional: true } }` anywhere but the direct value of an
 * object property (it omits that property when unset). */
export function checkTokenSites(host: unknown): DeclaredIssue[] {
  const issues: DeclaredIssue[] = [];
  for (const site of collectTokenSites(host)) {
    const path = formatPath(site.path);
    if (!tokenSchema.safeParse(site.token).success) {
      issues.push({
        path,
        message: `malformed ${site.key} token ${JSON.stringify(site.token)}. Shapes: { $output: { host, member?, path: [...] } }, { $concat: [string | number | token, ...] }, { $env: "NAME" } or { $env: { name: "NAME", optional: true } }, { $map: { over: $output | $item, as?: "name", to: template, into?: "record" } }, { $item: [path] } or { $item: { as: "name", path: [...] } }, { $key: true } or { $key: "name" }.`,
      });
      continue;
    }
    if (site.key === "$item" || site.key === "$key") {
      const scope = scopeOf(site);
      if ("error" in scope) issues.push({ path, message: scope.error });
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
            : site.position === "template"
              ? "the whole $map template"
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
    (typeof value === "object" || typeof value === "function") && value !== null
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
): { ok: true; schema: unknown } | { ok: false; at: number; reason: string } {
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
        return {
          ok: false,
          at: i,
          reason: `is a ${def.type}, not a container`,
        };
    }
  }
  return { ok: true, schema: current };
}

/** Whether the object schema at `path` names `key` in its shape (a
 * catchall does not count): what a runner's schema explicitly declares,
 * e.g. `runner.cspRegistrySync`. A union declares a key any member does. */
export function declaresKey(
  schema: unknown,
  path: OutputPath,
  key: string,
): boolean {
  const at = schemaAtPath(schema, path);
  if (!at.ok) return false;
  const def = defOf(at.schema);
  if (def?.type === "object") {
    return isPlainObjectLike(def.shape) && key in def.shape;
  }
  if (def?.type === "union" && Array.isArray(def.options)) {
    return def.options.some((option: unknown) => declaresKey(option, [], key));
  }
  return false;
}

/** Whether a (property) schema admits an absent value on the OUTPUT side:
 * `.optional()` does; `.default()`/`.prefault()` fill it in, and
 * `.nonoptional()` forbids it. */
function mayBeAbsent(schema: unknown): boolean {
  let current = schema;
  for (let guard = 0; guard < 32; guard++) {
    const internals = isPlainObjectLike(current) ? current._zod : undefined;
    if (isPlainObjectLike(internals) && internals.optout === "optional") {
      return true;
    }
    const def = defOf(current);
    if (!def) return false;
    if (def.type === "optional") return true;
    if (
      def.type === "default" ||
      def.type === "prefault" ||
      def.type === "nonoptional" ||
      !WRAPPERS.has(def.type)
    ) {
      return false;
    }
    current = def.innerType;
  }
  return false;
}

/** Whether `key` may be absent from a value of the object schema `schema`:
 * an optional property, or (in a union) one some member makes optional or
 * lacks. A record value or an array element is never optional. */
function optionalKeyIn(schema: unknown, key: string): boolean {
  const unwrapped = schemaAtPath(schema, []);
  const def = unwrapped.ok ? defOf(unwrapped.schema) : undefined;
  if (def?.type === "object") {
    const shape = isPlainObjectLike(def.shape) ? def.shape : {};
    return key in shape && mayBeAbsent(shape[key]);
  }
  if (def?.type === "union" && Array.isArray(def.options)) {
    return def.options.some((option: unknown) => {
      const inner = schemaAtPath(option, []);
      const optionDef = inner.ok ? defOf(inner.schema) : undefined;
      const shape =
        optionDef?.type === "object" && isPlainObjectLike(optionDef.shape)
          ? optionDef.shape
          : undefined;
      return (
        shape !== undefined && (!(key in shape) || mayBeAbsent(shape[key]))
      );
    });
  }
  return false;
}

/**
 * Whether the field `path[at]` is OPTIONAL in `schema` (a producer's
 * `outputsSchema`, or a `$map` element schema), given that `path[0..at-1]`
 * exists: the codegen'd `OutputToken<T | undefined>` / `ItemToken<T |
 * undefined>` positions, whose rendered property the resolver omits when
 * the field is absent. False for a record key, an array index, or a path
 * the schema does not describe.
 */
export function isOptionalField(
  schema: unknown,
  path: OutputPath,
  at: number,
): boolean {
  const key = path[at];
  if (typeof key !== "string") return false;
  const parent = schemaAtPath(schema, path.slice(0, at));
  return parent.ok && optionalKeyIn(parent.schema, key);
}

/** The element schema of a collection schema (array element, record
 * value), or undefined when the schema does not say. */
export function elementSchemaOf(schema: unknown): unknown {
  const collection = collectionOf(schema);
  return collection.kind === "array" || collection.kind === "record"
    ? collection.element
    : undefined;
}

/** What a `$map` iterates, as far as the schemas tell: its element schema
 * (undefined: unknown, so its `$item` paths are not checked) and a label for
 * messages. */
interface MapElement {
  element: unknown;
  label: string;
}

/** The collection kind of a schema (unwrapped): array, record, unknown (no
 * check possible) or something else. */
function collectionOf(
  schema: unknown,
):
  | { kind: "array" | "record"; element: unknown }
  | { kind: "unknown" }
  | { kind: "other"; type: string } {
  const unwrapped = schemaAtPath(schema, []);
  const def = unwrapped.ok ? defOf(unwrapped.schema) : undefined;
  if (!def) return { kind: "unknown" };
  if (def.type === "array") return { kind: "array", element: def.element };
  if (def.type === "record") return { kind: "record", element: def.valueType };
  // An object with a catchall is a record of its catchall (known keys may
  // differ: no element schema); a tuple renders like an array.
  if (def.type === "object") {
    const catchall = defOf(def.catchall);
    if (catchall && catchall.type !== "never") {
      const shape = isPlainObjectLike(def.shape) ? def.shape : {};
      return Object.keys(shape).length === 0
        ? { kind: "record", element: def.catchall }
        : { kind: "record", element: undefined };
    }
  }
  if (def.type === "tuple") return { kind: "array", element: undefined };
  if (def.type === "any" || def.type === "unknown" || def.type === "union") {
    return { kind: "unknown" };
  }
  return { kind: "other", type: def.type };
}

/** Every `$output` token's producer exists and its path is valid against
 * the producer's `outputsSchema`; every `$map`'s `over` is a collection
 * there (a record under `into: "record"`), and every `$item` path exists
 * in the element schema of the map it binds. */
export function checkOutputPaths(
  host: unknown,
  outputsSchemaOf: (ref: OutputRef) => OutputsSchemaLookup,
): DeclaredIssue[] {
  const issues: DeclaredIssue[] = [];
  // Element schema per `$map` token; outer maps are visited before the
  // tokens of their templates (document order).
  const elements = new Map<Record<string, unknown>, MapElement | undefined>();
  const elementOf = (scope: MapScope | { error: string }) =>
    "error" in scope ? undefined : elements.get(scope.token);
  for (const site of collectTokenSites(host)) {
    if (!tokenSchema.safeParse(site.token).success) continue;
    if (site.key === "$map") {
      elements.set(
        site.token,
        checkMap(site, outputsSchemaOf, elementOf, issues),
      );
      continue;
    }
    if (site.key === "$item") {
      const scope = scopeOf(site);
      const element = elementOf(scope);
      if (!element || element.element === undefined || "error" in scope) {
        continue;
      }
      const itemPath = itemPathOf(site);
      const hit = schemaAtPath(element.element, itemPath);
      if (!hit.ok) {
        const parent = itemPath.slice(0, hit.at);
        issues.push({
          path: formatPath(site.path),
          message: `${describeToken(site.token)}: the element${parent.length ? `'s ${formatPath(parent)}` : ""} of the $map at ${formatPath(scope.path)}${scope.as ? ` (as "${scope.as}")` : ""} ${hit.reason} (element of ${element.label}).`,
        });
      }
      continue;
    }
    if (site.key !== "$output") continue;
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

/** A `$map`'s `over` against its schema: a collection (a record under
 * `into: "record"`). Returns the element schema for the map's `$item`s. */
function checkMap(
  site: TokenSite,
  outputsSchemaOf: (ref: OutputRef) => OutputsSchemaLookup,
  elementOf: (scope: MapScope | { error: string }) => MapElement | undefined,
  issues: DeclaredIssue[],
): MapElement | undefined {
  const operand = site.token.$map;
  if (!isPlainObject(operand)) return undefined;
  const over = operand.over;
  const into = operand.into === "record";
  let schema: unknown;
  let label: string;
  // The over's own token site reports a bad producer or path; here only a
  // valid one is classified.
  if (isPlainObject(over) && "$output" in over) {
    const overSite: TokenSite = { ...site, key: "$output", token: over };
    const ref = refOf(overSite);
    if (!ref) return undefined;
    const lookup = outputsSchemaOf(ref);
    if ("error" in lookup) return undefined;
    const hit = schemaAtPath(lookup.schema, pathOf(overSite));
    if (!hit.ok) return undefined;
    schema = hit.schema;
    label = `${describeToken(over)} in the outputsSchema of ${lookup.label}`;
  } else if (isPlainObject(over) && "$item" in over) {
    const overSite: TokenSite = { ...site, key: "$item", token: over };
    const scope = scopeOf(overSite);
    const outer = elementOf(scope);
    if (!outer || outer.element === undefined) return undefined;
    const hit = schemaAtPath(outer.element, itemPathOf(overSite));
    if (!hit.ok) return undefined;
    schema = hit.schema;
    label = `${describeToken(over)} (element of ${outer.label})`;
  } else {
    return undefined;
  }
  const path = formatPath(site.path);
  const collection = collectionOf(schema);
  if (collection.kind === "unknown") return undefined;
  if (collection.kind === "other") {
    issues.push({
      path,
      message: `$map over ${label} is a ${collection.type}, not an array or a record; a $map iterates a collection.`,
    });
    return undefined;
  }
  if (into && collection.kind === "array") {
    issues.push({
      path,
      message: `$map with into: "record" maps over ${label}, which is an array: an array has no keys to keep. Drop into: "record" (the result is an array) or map over a record.`,
    });
    return undefined;
  }
  return { element: collection.element, label };
}
