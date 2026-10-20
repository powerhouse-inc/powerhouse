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
 * element, the whole value, or a `$concat` part. */
export type TokenPosition = "property" | "element" | "root" | "concat";

export interface TokenSite {
  /** Property keys and array indices from the host root to the token. */
  path: OutputPath;
  key: TokenKey;
  /** The token object itself (`{ $output: … }`, …). */
  token: Record<string, unknown>;
  position: TokenPosition;
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

/** Every token in `value`, in document order. `$concat` parts are visited
 * (they may be tokens themselves); the operands of other operators are not
 * (`$map` templates belong to T4). A `$$` escape hides its operand. */
export function collectTokenSites(value: unknown): TokenSite[] {
  const sites: TokenSite[] = [];
  visit(value, [], "root", sites);
  return sites;
}

function visit(
  value: unknown,
  path: OutputPath,
  position: TokenPosition,
  sites: TokenSite[],
): void {
  const key = tokenKeyOf(value);
  if (key && isPlainObject(value)) {
    sites.push({ path, key, token: value, position });
    const parts = value.$concat;
    if (key === "$concat" && Array.isArray(parts)) {
      parts.forEach((part: unknown, index) =>
        visit(part, [...path, "$concat", index], "concat", sites),
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child: unknown, index) =>
      visit(child, [...path, index], "element", sites),
    );
    return;
  }
  if (!isPlainObject(value) || isEscape(value)) return;
  for (const [childKey, child] of Object.entries(value)) {
    visit(child, [...path, childKey], "property", sites);
  }
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
