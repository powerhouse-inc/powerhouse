import { substituteBuiltinEnv, type BuiltinEnv } from "../env-substitution.js";
import { tokenKeyOf, tokenSchema, TOKEN_ESCAPE_KEY } from "../tokens.js";
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
 * resolving process; the `"${userData}"`/`"${projectRoot}"` string sugar is
 * substituted on the way. Pure and browser-safe.
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

  fail(trail: Trail, message: string): never {
    const where = this.sources.where ? `${this.sources.where}: ` : "";
    throw new TokenResolutionError(
      `${where}\`${formatPath(trail)}\` ${message}`,
    );
  }

  value(value: unknown, trail: Trail): unknown {
    if (typeof value === "string") {
      return this.sources.builtins
        ? substituteBuiltinEnv(value, this.sources.builtins)
        : value;
    }
    if (Array.isArray(value)) {
      return value.map((child: unknown, index) => {
        const out = this.value(child, [...trail, index]);
        if (out === OMIT) {
          this.fail([...trail, index], "is an optional $env inside an array.");
        }
        return out;
      });
    }
    if (!isPlainObject(value)) return value;
    if (isEscape(value)) return structuredClone(value[TOKEN_ESCAPE_KEY]);
    if (tokenKeyOf(value)) {
      const members = this.selfRefs(value, trail);
      if (members.length > 0) {
        this.deferred.push({ trail, token: value, members });
        return structuredClone(value);
      }
      return this.token(value, trail);
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      // deferSelf: member wrappers resolve per member, not here.
      if (this.self && trail.length === 0 && key === "children") {
        out[key] = child;
        continue;
      }
      const resolved = this.value(child, [...trail, key]);
      if (resolved !== OMIT) out[key] = resolved;
    }
    return out;
  }

  token(token: Record<string, unknown>, trail: Trail): unknown {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) {
      this.fail(trail, `is a malformed token: ${JSON.stringify(token)}.`);
    }
    const key = tokenKeyOf(token);
    switch (key) {
      case "$output":
        return this.output(token, trail);
      case "$env":
        return this.env(token.$env, trail);
      case "$concat":
        return this.concat(token.$concat, trail);
      default:
        return this.fail(
          trail,
          `uses ${key}, which this resolver does not support yet.`,
        );
    }
  }

  output(token: Record<string, unknown>, trail: Trail): unknown {
    const operand = token.$output;
    if (!isPlainObject(operand) || typeof operand.host !== "string") {
      return this.fail(trail, "is a malformed $output token.");
    }
    const ref: OutputRef =
      typeof operand.member === "string"
        ? { host: operand.host, member: operand.member }
        : { host: operand.host };
    const path = Array.isArray(operand.path) ? operand.path : [];
    if (!this.sources.outputs) {
      return this.fail(
        trail,
        `reads ${describeToken(token)}, but no outputs are available here.`,
      );
    }
    const lookup = this.sources.outputs.lookup(ref);
    if (lookup.status === "unavailable") {
      const where = this.sources.where ? `${this.sources.where}: ` : "";
      throw new TokenResolutionError(
        `${where}${lookup.message}\n  (needed by \`${formatPath(trail)}\`: ${describeToken(token)})`,
      );
    }
    let current: unknown = lookup.outputs;
    for (let i = 0; i < path.length; i++) {
      const segment: unknown = path[i];
      const items: unknown[] | undefined = Array.isArray(current)
        ? current
        : undefined;
      const next = items
        ? typeof segment === "number"
          ? items[segment]
          : undefined
        : isPlainObject(current) && typeof segment === "string"
          ? current[segment]
          : undefined;
      if (next === undefined) {
        const parent = path
          .slice(0, i)
          .filter(
            (p): p is string | number =>
              typeof p === "string" || typeof p === "number",
          );
        const has = isPlainObject(current)
          ? Object.keys(current).join(", ") || "nothing"
          : Array.isArray(current)
            ? `${current.length} elements`
            : JSON.stringify(current);
        const container = parent.length
          ? `outputs.${formatPath(parent)}`
          : "its outputs";
        const missing = formatPath([
          ...parent,
          typeof segment === "number" ? segment : String(segment),
        ]);
        return this.fail(
          trail,
          `reads ${describeToken(token)}, but host "${ref.host}" has no output at ${missing} (${container} has: ${has}).`,
        );
      }
      current = next;
    }
    return structuredClone(current);
  }

  env(operand: unknown, trail: Trail): unknown {
    const optional = isPlainObject(operand);
    const name = optional ? operand.name : operand;
    if (typeof name !== "string") {
      return this.fail(trail, "is a malformed $env token.");
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
    );
  }

  concat(parts: unknown, trail: Trail): string {
    if (!Array.isArray(parts)) {
      return this.fail(trail, "is a malformed $concat token.");
    }
    return parts
      .map((part: unknown, index) => {
        const at = [...trail, "$concat", index];
        const value = this.value(part, at);
        if (value === OMIT) {
          return this.fail(at, "is an optional $env inside $concat.");
        }
        if (typeof value === "string") return value;
        if (typeof value === "number") return String(value);
        return this.fail(
          at,
          `resolved to ${JSON.stringify(value)}; every $concat part must be a string or a number.`,
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
 * `$env` properties omitted, `$$` escapes unwrapped and the built-in string
 * sugar substituted. Throws `TokenResolutionError` naming the host path;
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
        setAt(done, site.trail, value === OMIT ? undefined : value, value === OMIT);
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
    if (Array.isArray(current) && typeof key === "number") current = current[key];
    else if (isPlainObject(current) && typeof key === "string") current = current[key];
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
