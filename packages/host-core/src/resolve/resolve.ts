import { substituteBuiltinEnv, type BuiltinEnv } from "../env-substitution.js";
import { tokenKeyOf, tokenSchema } from "../tokens.js";
import type { OutputRef } from "./declared.js";
import { memberForRef } from "./plan.js";
import {
  collectTokenSites,
  describeToken,
  formatPath,
  isEscape,
  isPlainObject,
} from "./walk.js";

/**
 * The resolver (pipeline step 5): replaces every token in a declared host
 * with its value. `$output` reads the producer's outputs through an
 * `OutputSource` (live compound members, or a standalone run record: the
 * node adapters in ./node.ts); `$env` reads the environment map of the
 * resolving process; `$map` renders its `to` template once per element of
 * its `over` (arrays in order, records key-sorted; `$item`/`$key` read the
 * element being rendered); the `"${userData}"`/`"${projectRoot}"` string
 * sugar is substituted on the way. Pure and browser-safe.
 */

export type OutputLookup =
  | { status: "available"; outputs: unknown }
  /** `message` is the complete, user-facing reason (e.g. "connect needs
   * outputs from host "switchboard", which is not running. …"). */
  | { status: "unavailable"; message: string };

export interface OutputSource {
  lookup(ref: OutputRef): OutputLookup;
}

export interface ResolveSources {
  /** Where `$output` tokens read. Absent: any `$output` fails. */
  outputs?: OutputSource;
  /** The resolving process's environment (`$env`). */
  env?: Readonly<Record<string, string | undefined>>;
  /** `userData`/`projectRoot`: always resolvable `$env` names and string
   * sugar. */
  builtins?: BuiltinEnv;
  /** The host file named in errors (`hosts/connect/host.js`). */
  where?: string;
}

export class TokenResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenResolutionError";
  }
}

/** A resolved `{ $env: { name, optional: true } }` whose variable is unset:
 * its enclosing property is omitted. */
const OMIT = Symbol("omit");

type Trail = (string | number)[];

/** One enclosing `$map` while its template renders: the element being
 * rendered, its key (record key, or array index) and the map's binding. */
interface Binding {
  /** Host path of the `$map` token. */
  path: Trail;
  as?: string;
  key: string | number;
  item: unknown;
}

/** Innermost last. */
type Scope = readonly Binding[];

/** `reactor.drives["workflows"]` (or `…[2]` for an array element). */
function elementText(binding: Binding): string {
  const key =
    typeof binding.key === "number"
      ? `[${binding.key}]`
      : `[${JSON.stringify(binding.key)}]`;
  return `${formatPath(binding.path)}${key}`;
}

/** Provenance of `$map`-rendered arrays: element index → the input key
 * (record key, or array index) it was rendered from. Lets resolved
 * validation name the element key, not just the result index. */
const renderedKeys = new WeakMap<object, readonly (string | number)[]>();

/**
 * The `$map` elements an issue path (from resolved validation of a resolved
 * host) passes through, as text: `$map element "workflows"`. Undefined when
 * the path crosses no `$map`-rendered array. Walk the SAME object
 * `resolveHostOutputs` returned (provenance is by identity).
 */
export function describeMapElements(
  host: unknown,
  path: readonly PropertyKey[],
): string | undefined {
  const found: string[] = [];
  let current = host;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") {
      const keys = renderedKeys.get(current);
      const key = keys?.[segment];
      if (key !== undefined) {
        found.push(
          `$map element ${typeof key === "number" ? `[${key}]` : JSON.stringify(key)}`,
        );
      }
      current = (current as unknown[])[segment];
    } else if (isPlainObject(current) && typeof segment === "string") {
      current = current[segment];
    } else {
      break;
    }
  }
  return found.length ? found.join(" › ") : undefined;
}

type PathWalk =
  | { ok: true; value: unknown }
  | { ok: false; at: number; has: string };

/** The value at `path` inside `root` (output data: records and arrays). */
function walkPath(root: unknown, path: readonly unknown[]): PathWalk {
  let current = root;
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    const next = Array.isArray(current)
      ? typeof segment === "number"
        ? (current as unknown[])[segment]
        : undefined
      : isPlainObject(current) && typeof segment === "string"
        ? current[segment]
        : undefined;
    if (next === undefined) {
      const has = isPlainObject(current)
        ? Object.keys(current).join(", ") || "nothing"
        : Array.isArray(current)
          ? `${current.length} elements`
          : JSON.stringify(current);
      return { ok: false, at: i, has };
    }
    current = next;
  }
  return { ok: true, value: current };
}

function pathSegments(path: readonly unknown[]): (string | number)[] {
  return path.filter(
    (p): p is string | number => typeof p === "string" || typeof p === "number",
  );
}

/** A compound's own member set, for `deferSelf`. */
export interface SelfMembers {
  /** The compound's members: key (`children.<key>`) and host folder. */
  members: readonly { key: string; host: string }[];
}

/** A token in a compound's own fields that reads one of its members. */
export interface DeferredToken {
  /** Host path (`config.agents.assistant.url`). */
  path: string;
  /** The member keys whose outputs it needs. */
  members: string[];
}

export interface DeferredResolution<T> {
  /** The host with every token resolved EXCEPT the deferred ones (still in
   * place) and the `children` wrappers (member-level: each member resolves
   * its own). */
  host: T;
  deferred: DeferredToken[];
  /** The member keys any deferred token needs (start them first). */
  needs: string[];
  /** Resolve the deferred tokens once those members have started, from
   * their live outputs (e.g. `compoundOutputSource`); returns the fully
   * resolved host (children still untouched). */
  finish(outputs: OutputSource): T;
}

interface DeferredSite {
  trail: Trail;
  token: Record<string, unknown>;
  members: string[];
}

class Resolver {
  readonly deferred: DeferredSite[] = [];

  constructor(
    private readonly sources: ResolveSources,
    private readonly self?: SelfMembers,
  ) {}

  /** The member keys a token reads (`$output` on a member's host), when
   * resolving a compound's own fields with `deferSelf`. */
  private selfRefs(token: Record<string, unknown>, trail: Trail): string[] {
    if (!this.self) return [];
    const keys = new Set<string>();
    for (const site of collectTokenSites(token)) {
      const operand = site.token.$output;
      if (site.key !== "$output" || !isPlainObject(operand)) continue;
      if (typeof operand.host !== "string") continue;
      const ref: OutputRef =
        typeof operand.member === "string"
          ? { host: operand.host, member: operand.member }
          : { host: operand.host };
      const isMember = this.self.members.some((m) => m.host === ref.host);
      if (!isMember) continue;
      const target = memberForRef(ref, this.self.members);
      if ("error" in target) {
        this.fail([...trail, ...site.path], `in a compound ${target.error}`);
      }
      keys.add(target.key);
    }
    return [...keys];
  }

  fail(trail: Trail, message: string, scope: Scope = []): never {
    const where = this.sources.where ? `${this.sources.where}: ` : "";
    const inside = scope.length
      ? ` (rendering $map element ${scope.map(elementText).join(" › ")})`
      : "";
    throw new TokenResolutionError(
      `${where}\`${formatPath(trail)}\` ${message}${inside}`,
    );
  }

  value(value: unknown, trail: Trail, scope: Scope = []): unknown {
    if (typeof value === "string") {
      return this.sources.builtins
        ? substituteBuiltinEnv(value, this.sources.builtins)
        : value;
    }
    if (Array.isArray(value)) {
      return value.map((child: unknown, index) => {
        const out = this.value(child, [...trail, index], scope);
        if (out === OMIT) {
          this.fail(
            [...trail, index],
            "is an optional $env inside an array.",
            scope,
          );
        }
        return out;
      });
    }
    if (!isPlainObject(value)) return value;
    // A `$$` escape stays wrapped: validateHost unwraps it after its
    // no-token walk, so an escaped literal is never mistaken for a token.
    if (isEscape(value)) return structuredClone(value);
    if (tokenKeyOf(value)) {
      // Inside a template the enclosing (top-level) $map was already
      // examined: a self-reference anywhere in it defers the whole map.
      const members = scope.length === 0 ? this.selfRefs(value, trail) : [];
      if (members.length > 0) {
        this.deferred.push({ trail, token: value, members });
        return structuredClone(value);
      }
      return this.token(value, trail, scope);
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      // deferSelf: member wrappers resolve per member, not here.
      if (this.self && trail.length === 0 && key === "children") {
        out[key] = child;
        continue;
      }
      const resolved = this.value(child, [...trail, key], scope);
      if (resolved !== OMIT) out[key] = resolved;
    }
    return out;
  }

  token(
    token: Record<string, unknown>,
    trail: Trail,
    scope: Scope = [],
  ): unknown {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) {
      this.fail(
        trail,
        `is a malformed token: ${JSON.stringify(token)}.`,
        scope,
      );
    }
    const key = tokenKeyOf(token);
    switch (key) {
      case "$output":
        return this.output(token, trail, scope);
      case "$env":
        return this.env(token.$env, trail, scope);
      case "$concat":
        return this.concat(token.$concat, trail, scope);
      case "$map":
        return this.map(token.$map, trail, scope);
      case "$item":
        return this.item(token.$item, trail, scope);
      case "$key":
        return this.key(token.$key, trail, scope);
      default:
        return this.fail(trail, `is not a token.`, scope);
    }
  }

  /** The binding an `$item`/`$key` names: the innermost map, or the
   * enclosing map whose `as` is `name`. */
  binding(
    name: string | undefined,
    operator: "$item" | "$key",
    trail: Trail,
    scope: Scope,
  ): Binding {
    if (scope.length === 0) {
      return this.fail(
        trail,
        `uses ${operator} outside any $map; ${operator} reads the element a $map template is rendering.`,
      );
    }
    if (name === undefined) return scope[scope.length - 1];
    for (let i = scope.length - 1; i >= 0; i--) {
      if (scope[i].as === name) return scope[i];
    }
    const named = scope.flatMap((b) => (b.as ? [`"${b.as}"`] : []));
    return this.fail(
      trail,
      `uses ${operator} with binding "${name}", which no enclosing $map declares (as: ${named.join(", ") || "none"}).`,
      scope,
    );
  }

  map(operand: unknown, trail: Trail, scope: Scope): unknown {
    if (!isPlainObject(operand)) {
      return this.fail(trail, "is a malformed $map token.", scope);
    }
    const into = operand.into === "record";
    const as = typeof operand.as === "string" ? operand.as : undefined;
    const over = this.value(operand.over, [...trail, "$map", "over"], scope);
    const render = (key: string | number, item: unknown): unknown => {
      const inner: Scope = [
        ...scope,
        { path: trail, key, item, ...(as !== undefined ? { as } : {}) },
      ];
      const at = [...trail, "$map", "to"];
      const out = this.value(operand.to, at, inner);
      if (out === OMIT) {
        return this.fail(
          at,
          "is an optional $env as the whole $map template; there is no property to omit.",
          inner,
        );
      }
      return out;
    };
    if (Array.isArray(over)) {
      if (into) {
        return this.fail(
          trail,
          `is a $map with into: "record", but its over (${describeToken(operand.over)}) resolved to an array, which has no keys to keep. Drop into: "record" (the result is an array) or map over a record.`,
          scope,
        );
      }
      const rendered = over.map((item: unknown, index) => render(index, item));
      renderedKeys.set(
        rendered,
        over.map((_: unknown, index) => index),
      );
      return rendered;
    }
    if (isPlainObject(over)) {
      // Key-sorted (code-unit order): deterministic, whatever order the
      // producer published its outputs in.
      const keys = Object.keys(over).sort();
      if (!into) {
        const rendered = keys.map((key) => render(key, over[key]));
        renderedKeys.set(rendered, keys);
        return rendered;
      }
      const out: Record<string, unknown> = {};
      for (const key of keys) out[key] = render(key, over[key]);
      return out;
    }
    return this.fail(
      trail,
      `is a $map whose over (${describeToken(operand.over)}) resolved to ${JSON.stringify(over)}${into ? `; into: "record" needs a record` : ", which is not an array or a record"}.`,
      scope,
    );
  }

  item(operand: unknown, trail: Trail, scope: Scope): unknown {
    const named = isPlainObject(operand) ? operand : undefined;
    const name = named && typeof named.as === "string" ? named.as : undefined;
    const raw: unknown = named ? named.path : operand;
    const path = pathSegments(Array.isArray(raw) ? raw : []);
    const binding = this.binding(name, "$item", trail, scope);
    const hit = walkPath(binding.item, path);
    if (!hit.ok) {
      const missing = formatPath(path.slice(0, hit.at + 1));
      return this.fail(
        trail,
        `reads $item ${formatPath(path)}, but $map element ${elementText(binding)} has no ${missing} (it has: ${hit.has}).`,
        scope,
      );
    }
    return structuredClone(hit.value);
  }

  key(operand: unknown, trail: Trail, scope: Scope): string | number {
    const name = typeof operand === "string" ? operand : undefined;
    return this.binding(name, "$key", trail, scope).key;
  }

  output(
    token: Record<string, unknown>,
    trail: Trail,
    scope: Scope = [],
  ): unknown {
    const operand = token.$output;
    if (!isPlainObject(operand) || typeof operand.host !== "string") {
      return this.fail(trail, "is a malformed $output token.", scope);
    }
    const ref: OutputRef =
      typeof operand.member === "string"
        ? { host: operand.host, member: operand.member }
        : { host: operand.host };
    const path = pathSegments(Array.isArray(operand.path) ? operand.path : []);
    if (!this.sources.outputs) {
      return this.fail(
        trail,
        `reads ${describeToken(token)}, but no outputs are available here.`,
        scope,
      );
    }
    const lookup = this.sources.outputs.lookup(ref);
    if (lookup.status === "unavailable") {
      const where = this.sources.where ? `${this.sources.where}: ` : "";
      throw new TokenResolutionError(
        `${where}${lookup.message}\n  (needed by \`${formatPath(trail)}\`: ${describeToken(token)})`,
      );
    }
    const hit = walkPath(lookup.outputs, path);
    if (!hit.ok) {
      const parent = path.slice(0, hit.at);
      const container = parent.length
        ? `outputs.${formatPath(parent)}`
        : "its outputs";
      const missing = formatPath(path.slice(0, hit.at + 1));
      return this.fail(
        trail,
        `reads ${describeToken(token)}, but host "${ref.host}" has no output at ${missing} (${container} has: ${hit.has}).`,
        scope,
      );
    }
    return structuredClone(hit.value);
  }

  env(operand: unknown, trail: Trail, scope: Scope = []): unknown {
    const optional = isPlainObject(operand);
    const name = optional ? operand.name : operand;
    if (typeof name !== "string") {
      return this.fail(trail, "is a malformed $env token.", scope);
    }
    const builtins = this.sources.builtins;
    if ((name === "userData" || name === "projectRoot") && builtins?.[name]) {
      return builtins[name];
    }
    const value = this.sources.env?.[name];
    if (value !== undefined) return value;
    if (optional) return OMIT;
    return this.fail(
      trail,
      `reads $env ${name}, which is not set. Set ${name} in the environment of the process that resolves this host (or declare { $env: { name: "${name}", optional: true } } to omit the property when unset).`,
      scope,
    );
  }

  concat(parts: unknown, trail: Trail, scope: Scope = []): string {
    if (!Array.isArray(parts)) {
      return this.fail(trail, "is a malformed $concat token.", scope);
    }
    return parts
      .map((part: unknown, index) => {
        const at = [...trail, "$concat", index];
        const value = this.value(part, at, scope);
        if (value === OMIT) {
          return this.fail(at, "is an optional $env inside $concat.", scope);
        }
        if (typeof value === "string") return value;
        if (typeof value === "number") return String(value);
        return this.fail(
          at,
          `resolved to ${JSON.stringify(value)}; every $concat part must be a string or a number.`,
          scope,
        );
      })
      .join("");
  }
}

export interface ResolveOptions {
  /** Resolving a COMPOUND's own fields: tokens that read one of its members
   * are deferred until those members have started (see
   * `DeferredResolution`); `children` is left for the members. */
  deferSelf: SelfMembers;
}

/**
 * Resolve every token in a declared host (or any JSON-shaped value): the
 * result has the same shape with tokens replaced by values, optional unset
 * `$env` properties omitted and the built-in string sugar substituted (`$$`
 * escapes are kept; validateHost unwraps them). Throws `TokenResolutionError` naming the host path;
 * an `$output` whose producer is not running fails with the source's
 * message (no fallback, no waiting).
 *
 * With `{ deferSelf }` (a compound resolving its own fields), returns a
 * `DeferredResolution` instead: everything but the self-references now,
 * and `finish(outputs)` for the rest once the members it needs run.
 */
export function resolveHostOutputs<T>(host: T, sources: ResolveSources): T;
export function resolveHostOutputs<T>(
  host: T,
  sources: ResolveSources,
  options: ResolveOptions,
): DeferredResolution<T>;
export function resolveHostOutputs<T>(
  host: T,
  sources: ResolveSources,
  options?: ResolveOptions,
): T | DeferredResolution<T> {
  const resolver = new Resolver(sources, options?.deferSelf);
  const out = resolver.value(host, []);
  if (out === OMIT) {
    resolver.fail([], "is an optional $env with nothing to omit it from.");
  }
  // Same shape as the declared input: every token-able field's input type
  // admits both the token and the value it resolves to.
  const partial = out as T;
  if (!options) return partial;
  const sites = resolver.deferred;
  return {
    host: partial,
    deferred: sites.map((d) => ({
      path: formatPath(d.trail),
      members: d.members,
    })),
    needs: [...new Set(sites.flatMap((d) => d.members))],
    finish(outputs: OutputSource): T {
      const done: unknown = structuredClone(partial);
      const late = new Resolver({ ...sources, outputs });
      for (const site of sites) {
        const value = late.token(site.token, site.trail);
        setAt(
          done,
          site.trail,
          value === OMIT ? undefined : value,
          value === OMIT,
        );
      }
      return done as T;
    },
  };
}

function setAt(
  root: unknown,
  trail: Trail,
  value: unknown,
  omit: boolean,
): void {
  let current = root;
  for (const key of trail.slice(0, -1)) {
    if (Array.isArray(current) && typeof key === "number")
      current = current[key];
    else if (isPlainObject(current) && typeof key === "string")
      current = current[key];
    else return;
  }
  const last = trail[trail.length - 1];
  if (Array.isArray(current) && typeof last === "number") {
    current[last] = value;
  } else if (isPlainObject(current) && typeof last === "string") {
    if (omit) delete current[last];
    else current[last] = value;
  }
}
