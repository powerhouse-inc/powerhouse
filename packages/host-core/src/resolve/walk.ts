import {
  TOKEN_ESCAPE_KEY,
  tokenKeyOf,
  type OutputPath,
  type TokenKey,
} from "../tokens.js";

/**
 * Token discovery over a declared (JSON-shaped) host: where every operator
 * sits and in which syntactic position, which is what declared validation
 * (`$env` optional placement), the dependency plan and `--explain outputs`
 * read. Pure: no node imports.
 */

/** Where a token sits: the direct value of an object property, an array
 * element, the whole value, a `$concat` part, a `$map`'s `over`, or the
 * whole `to` template of a `$map` (the top of the rendered element). */
export type TokenPosition =
  | "property"
  | "element"
  | "root"
  | "concat"
  | "over"
  | "template";

/** An enclosing `$map`, as seen from a token inside its `to` template. */
export interface MapScope {
  /** Host path of the `$map` token. */
  path: OutputPath;
  /** Its binding name (`$map.as`), if any. */
  as?: string;
  /** The `$map` token itself. */
  token: Record<string, unknown>;
}

export interface TokenSite {
  /** Property keys and array indices from the host root to the token
   * (`$map` operands appear as `…$map.over` / `…$map.to…`). */
  path: OutputPath;
  key: TokenKey;
  /** The token object itself (`{ $output: … }`, …). */
  token: Record<string, unknown>;
  position: TokenPosition;
  /** The `$map`s whose template holds this token, outermost first (the
   * innermost binding is last). A map's own `over` is in its OUTER scope. */
  scopes: readonly MapScope[];
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** `a.b[2].c` (or `<root>`). */
export function formatPath(path: readonly (string | number)[]): string {
  let out = "";
  for (const segment of path) {
    if (typeof segment === "number") out += `[${segment}]`;
    else out += out ? `.${segment}` : segment;
  }
  return out || "<root>";
}

/** Is this object a `$$` escape (`{ $$: literal }`)? */
export function isEscape(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === TOKEN_ESCAPE_KEY;
}

/** Every token in `value`, in document order. `$concat` parts and `$map`
 * operands (`over`, then the `to` template) are visited: they may hold tokens
 * themselves. Each site carries the `$map` scopes it sits in. A `$$` escape
 * hides its operand. */
export function collectTokenSites(value: unknown): TokenSite[] {
  const sites: TokenSite[] = [];
  visit(value, [], "root", [], sites);
  return sites;
}

function visit(
  value: unknown,
  path: OutputPath,
  position: TokenPosition,
  scopes: readonly MapScope[],
  sites: TokenSite[],
): void {
  const key = tokenKeyOf(value);
  if (key && isPlainObject(value)) {
    sites.push({ path, key, token: value, position, scopes });
    const operand = value[key];
    if (key === "$concat" && Array.isArray(operand)) {
      operand.forEach((part: unknown, index) =>
        visit(part, [...path, "$concat", index], "concat", scopes, sites),
      );
    }
    if (key === "$map" && isPlainObject(operand)) {
      const at = [...path, "$map"];
      // `over` is evaluated in the enclosing scope; only `to` sees this map.
      if ("over" in operand) {
        visit(operand.over, [...at, "over"], "over", scopes, sites);
      }
      if ("to" in operand) {
        const scope: MapScope = {
          path,
          token: value,
          ...(typeof operand.as === "string" ? { as: operand.as } : {}),
        };
        visit(operand.to, [...at, "to"], "template", [...scopes, scope], sites);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child: unknown, index) =>
      visit(child, [...path, index], "element", scopes, sites),
    );
    return;
  }
  if (!isPlainObject(value) || isEscape(value)) return;
  for (const [childKey, child] of Object.entries(value)) {
    visit(child, [...path, childKey], "property", scopes, sites);
  }
}

/** An `$item` path as text: `url`, `drives.x`, `<element>` for `[]`. */
function pathText(path: readonly unknown[]): string {
  if (path.length === 0) return "<element>";
  return formatPath(
    path.filter(
      (p): p is string | number =>
        typeof p === "string" || typeof p === "number",
    ),
  );
}

/** A one-line human rendering of a token, for `--explain` and messages. */
export function describeToken(token: unknown): string {
  const key = tokenKeyOf(token);
  if (!key || !isPlainObject(token)) return JSON.stringify(token);
  const operand = token[key];
  if (key === "$output" && isPlainObject(operand)) {
    const host = typeof operand.host === "string" ? operand.host : "?";
    const member =
      typeof operand.member === "string" ? ` (member ${operand.member})` : "";
    const path = Array.isArray(operand.path)
      ? formatPath(
          operand.path.filter(
            (p): p is string | number =>
              typeof p === "string" || typeof p === "number",
          ),
        )
      : "?";
    return `$output ${host}${member} › ${path}`;
  }
  if (key === "$env") {
    if (typeof operand === "string") return `$env ${operand}`;
    if (isPlainObject(operand) && typeof operand.name === "string") {
      return `$env ${operand.name} (optional)`;
    }
  }
  if (key === "$item") {
    const named = isPlainObject(operand) ? operand : undefined;
    const raw: unknown = named ? named.path : operand;
    const path = Array.isArray(raw) ? pathText(raw) : "?";
    const binding =
      named && typeof named.as === "string" ? `(${named.as})` : "";
    return `$item${binding} ${path}`;
  }
  if (key === "$key") {
    return typeof operand === "string" ? `$key(${operand})` : "$key";
  }
  if (key === "$map" && isPlainObject(operand)) {
    const as = typeof operand.as === "string" ? ` as ${operand.as}` : "";
    const into = operand.into === "record" ? " into record" : "";
    return `$map over [${describeToken(operand.over)}]${as}${into} → ${JSON.stringify(render(operand.to))}`;
  }
  if (key === "$concat" && Array.isArray(operand)) {
    const parts = operand.map((part: unknown) =>
      typeof part === "string"
        ? JSON.stringify(part)
        : typeof part === "number"
          ? String(part)
          : `[${describeToken(part)}]`,
    );
    return `$concat ${parts.join(" + ")}`;
  }
  return `${key} ${JSON.stringify(operand)}`;
}

/** A display copy of `value` with every token replaced by `«description»`
 * (for printing declared hosts, e.g. `--explain drives`). */
export function renderTokens<T>(value: T): T {
  return render(value) as T;
}

function render(value: unknown): unknown {
  if (tokenKeyOf(value)) return `«${describeToken(value)}»`;
  if (Array.isArray(value)) return value.map(render);
  if (!isPlainObject(value) || isEscape(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) out[key] = render(child);
  return out;
}

/** A copy of `value` with every `$$` escape replaced by its operand (the
 * literal it protects). Run after the no-token walk. */
export function unwrapEscapes<T>(value: T): T {
  return unwrap(value) as T;
}

function unwrap(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrap);
  if (!isPlainObject(value)) return value;
  if (isEscape(value)) return structuredClone(value[TOKEN_ESCAPE_KEY]);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) out[key] = unwrap(child);
  return out;
}
