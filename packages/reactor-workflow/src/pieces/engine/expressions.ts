// {{…}} expressions over the run scope. Grammar and rules: README, "Expressions".

export interface ExpressionScope {
  trigger?: unknown;
  // A step contributes `output` when it succeeded and `error` when it did not.
  // The failed entry is what an error-port branch reads.
  steps: Record<string, { output?: unknown; error?: string }>;
  variables: Record<string, unknown>;
}

export type PathSegment = string | number;

export interface PathTerm {
  kind: "path";
  segments: PathSegment[];
  // `?` suffix: a missing value resolves to null instead of failing.
  optional: boolean;
  source: string;
}

export interface LiteralTerm {
  kind: "literal";
  value: string;
}

export type ExpressionTerm = PathTerm | LiteralTerm;

// `a || b || 'x'`: the first term with a value other than null or "".
export interface Expression {
  terms: ExpressionTerm[];
  source: string;
}

export class ExpressionSyntaxError extends Error {
  constructor(source: string, detail: string) {
    super(`Invalid expression {{${source}}}: ${detail}`);
    this.name = "ExpressionSyntaxError";
  }
}

export class UnresolvedReferenceError extends Error {
  constructor(readonly reference: string) {
    super(`Unresolved reference {{${reference}}}`);
    this.name = "UnresolvedReferenceError";
  }
}

/**
 * A value that exists but cannot be read, with the reason attached.
 *
 * The case it was written for: a rerun replaying a SUCCEEDED step whose
 * journaled output the payload cap truncated. The step must NOT run again — it
 * had side effects — but its output is genuinely gone, so a downstream step
 * that reads it has to be told, by name, rather than handed a truncation
 * marker or quietly made to re-run the step that produced it.
 *
 * The reason hangs off a SYMBOL key, so `JSON.stringify` drops it and nothing
 * can leak the wrapper into a payload as data.
 */
const UNAVAILABLE = Symbol("unavailable");

export class UnavailableValueError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "UnavailableValueError";
  }
}

export function unavailableValue(reason: string): unknown {
  return { [UNAVAILABLE]: reason };
}

function unavailableReason(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const reason = (value as Record<symbol, unknown>)[UNAVAILABLE];
  return typeof reason === "string" ? reason : undefined;
}

/**
 * The reason of the first {@link unavailableValue} anywhere inside a value,
 * however deep, or undefined when there is none.
 *
 * A shallow check is not enough, and that was the hole: `{{steps.charge}}`
 * lands on the step's whole entry rather than on the wrapper, so the wrapper
 * sits one level down as `{ output: <wrapper> }`. The path check saw an
 * ordinary object, handed it over as data, and `JSON.stringify` then dropped
 * the symbol on the way to the piece — the downstream step received `{}` and
 * the reason was gone. Refusing by name is the whole point of the wrapper.
 */
export function unavailableValueReason(value: unknown): string | undefined {
  const own = unavailableReason(value);
  if (own !== undefined) return own;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = unavailableValueReason(item);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }
  if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value)) {
      const nested = unavailableValueReason(entry);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

/** True for anything {@link unavailableValue} produced, at any depth of a
 * resolved value. Lets a caller refuse before a piece is handed it. */
export function containsUnavailableValue(value: unknown): boolean {
  return unavailableValueReason(value) !== undefined;
}

/** Throws {@link UnavailableValueError} when a resolved value holds an
 * unavailable wrapper at any depth; the gate every resolved input passes. */
export function assertNoUnavailableValue(value: unknown): void {
  const reason = unavailableValueReason(value);
  if (reason !== undefined) throw new UnavailableValueError(reason);
}

const IDENT = /[A-Za-z0-9_$-]/;

// A hand-rolled tokenizer: dot and bracket paths, quoted literals, `||`, `?`.
export function parseExpression(source: string): Expression {
  let i = 0;
  const fail = (detail: string): never => {
    throw new ExpressionSyntaxError(source, detail);
  };
  const skipSpace = () => {
    while (i < source.length && /\s/.test(source[i])) i++;
  };
  const readString = (): string => {
    const quote = source[i++];
    let out = "";
    while (i < source.length && source[i] !== quote) {
      if (source[i] === "\\" && i + 1 < source.length) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      out += source[i++];
    }
    if (source[i] !== quote) fail("unterminated string");
    i++;
    return out;
  };
  const readIdent = (): string => {
    const start = i;
    while (i < source.length && IDENT.test(source[i])) i++;
    if (i === start) fail(`expected a name at position ${start}`);
    return source.slice(start, i);
  };
  const readTerm = (): ExpressionTerm => {
    skipSpace();
    const start = i;
    if (source[i] === "'" || source[i] === '"') {
      return { kind: "literal", value: readString() };
    }
    const segments: PathSegment[] = [readIdent()];
    for (;;) {
      if (source[i] === ".") {
        i++;
        segments.push(readIdent());
        continue;
      }
      if (source[i] === "[") {
        i++;
        skipSpace();
        if (source[i] === "'" || source[i] === '"') {
          segments.push(readString());
        } else {
          const digits = /^\d+/.exec(source.slice(i));
          if (!digits) fail("a bracket takes a quoted key or an index");
          segments.push(Number(digits![0]));
          i += digits![0].length;
        }
        skipSpace();
        if (source[i] !== "]") fail("expected ]");
        i++;
        continue;
      }
      break;
    }
    const optional = source[i] === "?";
    if (optional) i++;
    return {
      kind: "path",
      segments,
      optional,
      source: source.slice(start, i),
    };
  };

  const terms: ExpressionTerm[] = [readTerm()];
  for (;;) {
    skipSpace();
    if (i >= source.length) break;
    if (source.startsWith("||", i)) {
      i += 2;
      terms.push(readTerm());
      continue;
    }
    fail(`unexpected "${source[i]}" at position ${i}`);
  }
  return { terms, source: source.trim() };
}

interface Segment {
  kind: "text" | "expression";
  text: string;
}

// Splits text into literal runs and {{…}} bodies. `\{{` is a literal `{{`;
// `}}` inside a quoted literal does not close; an unclosed `{{` is text.
export function splitTemplate(text: string): Segment[] {
  const out: Segment[] = [];
  let pending = "";
  let cursor = 0;
  const flush = () => {
    if (pending) out.push({ kind: "text", text: pending });
    pending = "";
  };
  for (;;) {
    const open = text.indexOf("{{", cursor);
    if (open < 0) break;
    if (open > 0 && text[open - 1] === "\\") {
      pending += text.slice(cursor, open - 1) + "{{";
      cursor = open + 2;
      continue;
    }
    let i = open + 2;
    let quote: string | undefined;
    let close = -1;
    for (; i < text.length; i++) {
      const char = text[i];
      if (quote) {
        if (char === "\\") i++;
        else if (char === quote) quote = undefined;
        continue;
      }
      if (char === "'" || char === '"') quote = char;
      else if (text.startsWith("}}", i)) {
        close = i;
        break;
      }
    }
    if (close < 0) break;
    pending += text.slice(cursor, open);
    flush();
    out.push({ kind: "expression", text: text.slice(open + 2, close) });
    cursor = close + 2;
  }
  pending += text.slice(cursor);
  flush();
  return out;
}

/** Every expression a string holds, parsed. */
export function expressionsIn(text: string): Expression[] {
  return splitTemplate(text)
    .filter((segment) => segment.kind === "expression")
    .map((segment) => parseExpression(segment.text));
}

const MISSING = Symbol("missing");

export function lookupPath(
  scope: ExpressionScope,
  segments: readonly PathSegment[],
): unknown {
  let current: unknown = scope;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") return MISSING;
    // Not missing and not readable: say which, before the path walks into it.
    // Shallow on purpose — a container holding one unavailable entry is still
    // readable for every other path through it.
    const blocked = unavailableReason(current);
    if (blocked !== undefined) throw new UnavailableValueError(blocked);
    const record = current as Record<string | number, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, segment)) return MISSING;
    current = record[segment];
  }
  // What the path landed on is what leaves resolution, so the check here is
  // DEEP: `steps.x.output` lands on the wrapper itself, but `steps.x` lands on
  // the entry holding it, and handing that over would drop the reason on the
  // symbol and give the piece a bare `{}`.
  assertNoUnavailableValue(current);
  return current === undefined ? MISSING : current;
}

const isEmpty = (value: unknown) => value === null || value === "";

export function evaluateExpression(
  expression: Expression,
  scope: ExpressionScope,
): unknown {
  const last = expression.terms.length - 1;
  let value: unknown = null;
  for (const [index, term] of expression.terms.entries()) {
    if (term.kind === "literal") {
      value = term.value;
    } else {
      const found = lookupPath(scope, term.segments);
      if (found === MISSING) {
        if (term.optional) value = null;
        else if (index === last)
          throw new UnresolvedReferenceError(term.source);
        else continue;
      } else value = found;
    }
    if (!isEmpty(value)) return value;
  }
  return value;
}

function interpolate(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value as string | number | boolean);
}

// A string that is one {{…}} once trimmed yields the raw value; any other
// string with expressions is interpolated text.
export function resolveTemplate(text: string, scope: ExpressionScope): unknown {
  const segments = splitTemplate(text);
  if (!segments.some((segment) => segment.kind === "expression")) {
    return segments.map((segment) => segment.text).join("");
  }
  const meaningful = segments.filter(
    (segment) => segment.kind === "expression" || segment.text.trim() !== "",
  );
  if (meaningful.length === 1) {
    return evaluateExpression(parseExpression(meaningful[0].text), scope);
  }
  return segments
    .map((segment) =>
      segment.kind === "text"
        ? segment.text
        : interpolate(evaluateExpression(parseExpression(segment.text), scope)),
    )
    .join("");
}

/** Evaluates every string in a value, nested ones included. */
export function resolveExpressions(
  value: unknown,
  scope: ExpressionScope,
): unknown {
  if (typeof value === "string") return resolveTemplate(value, scope);
  if (Array.isArray(value)) {
    return value.map((item) => resolveExpressions(item, scope));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        resolveExpressions(entry, scope),
      ]),
    );
  }
  return value;
}

// Truthiness of a resolved condition; the strings "false" and "0" are falsy.
export function evaluateCondition(
  condition: string,
  scope: ExpressionScope,
): boolean {
  const resolved = resolveTemplate(condition, scope);
  if (resolved === "false" || resolved === "0") return false;
  return Boolean(resolved);
}
