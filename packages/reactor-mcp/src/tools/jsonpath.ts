// A JSONPath subset: `$`, `.name`, `['name']`, `[n]` (negative counts from the
// end), `[(@.length-n)]`, `[*]`/`.*`, `..name`, `[a,b]` and `[?(@.path op value)]`.

type Segment =
  | { kind: "child"; keys: (string | number)[] }
  | { kind: "wildcard" }
  | { kind: "descend"; key: string }
  | { kind: "recurse" }
  | { kind: "filter"; path: string[]; op?: Comparison; value?: unknown };

type Comparison = "==" | "!=" | "<" | "<=" | ">" | ">=";

export class JsonPathError extends Error {
  constructor(path: string, reason: string) {
    super(`Invalid JSONPath "${path}": ${reason}`);
    this.name = "JsonPathError";
  }
}

const NAME = /^[A-Za-z_$][\w$-]*/;

function parseLiteral(text: string, path: string): unknown {
  const t = text.trim();
  if (/^'.*'$/s.test(t)) return t.slice(1, -1).replace(/\\'/g, "'");
  if (/^".*"$/s.test(t)) return JSON.parse(t) as unknown;
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (t !== "" && !Number.isNaN(Number(t))) return Number(t);
  throw new JsonPathError(path, `unsupported literal ${t}`);
}

function parseFilter(body: string, path: string): Segment {
  const match =
    /^@((?:\.[A-Za-z_$][\w$-]*)*)\s*(?:(==|!=|<=|>=|<|>)\s*(.+))?$/s.exec(
      body.trim(),
    );
  if (!match) throw new JsonPathError(path, `unsupported filter ${body}`);
  const keys = match[1] ? match[1].slice(1).split(".") : [];
  if (!match[2]) return { kind: "filter", path: keys };
  return {
    kind: "filter",
    path: keys,
    op: match[2] as Comparison,
    value: parseLiteral(match[3], path),
  };
}

// Splits on commas outside quotes.
function splitUnion(body: string): string[] {
  const parts: string[] = [];
  let quote: string | undefined;
  let current = "";
  for (const char of body) {
    if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function parseBracket(body: string, path: string): Segment {
  const t = body.trim();
  if (t === "*") return { kind: "wildcard" };
  if (t.startsWith("?(") && t.endsWith(")")) {
    return parseFilter(t.slice(2, -1), path);
  }
  const length = /^\(\s*@\.length\s*-\s*(\d+)\s*\)$/.exec(t);
  if (length) return { kind: "child", keys: [-Number(length[1])] };
  const keys = splitUnion(t).map((part) => {
    const p = part.trim();
    if (/^-?\d+$/.test(p)) return Number(p);
    const literal = parseLiteral(p, path);
    if (typeof literal !== "string") {
      throw new JsonPathError(path, `unsupported selector ${p}`);
    }
    return literal;
  });
  return { kind: "child", keys };
}

// Index of the bracket closing the one at `start`, skipping quoted text.
function closingBracket(path: string, start: number): number {
  let depth = 0;
  let quote: string | undefined;
  for (let i = start; i < path.length; i++) {
    const char = path[i];
    if (quote) {
      if (char === quote && path[i - 1] !== "\\") quote = undefined;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "[") {
      depth++;
    } else if (char === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new JsonPathError(path, "unclosed [");
}

export function parseJsonPath(path: string): Segment[] {
  const text = path.trim();
  if (!text.startsWith("$")) throw new JsonPathError(path, "must start with $");
  const segments: Segment[] = [];
  let i = 1;
  while (i < text.length) {
    const rest = text.slice(i);
    if (rest.startsWith("..")) {
      i += 2;
      if (text[i] === "*") {
        segments.push({ kind: "descend", key: "*" });
        i++;
        continue;
      }
      if (text[i] === "[") {
        segments.push({ kind: "recurse" });
        continue;
      }
      const name = NAME.exec(text.slice(i));
      if (!name) throw new JsonPathError(path, `expected a name at ${i}`);
      segments.push({ kind: "descend", key: name[0] });
      i += name[0].length;
    } else if (rest.startsWith(".")) {
      i++;
      if (text[i] === "*") {
        segments.push({ kind: "wildcard" });
        i++;
        continue;
      }
      const name = NAME.exec(text.slice(i));
      if (!name) throw new JsonPathError(path, `expected a name at ${i}`);
      segments.push({ kind: "child", keys: [name[0]] });
      i += name[0].length;
    } else if (rest.startsWith("[")) {
      const end = closingBracket(text, i);
      segments.push(parseBracket(text.slice(i + 1, end), path));
      i = end + 1;
    } else {
      throw new JsonPathError(path, `unexpected "${text[i]}" at ${i}`);
    }
  }
  return segments;
}

function children(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === "object") return Object.values(value);
  return [];
}

function child(value: unknown, key: string | number): unknown[] {
  if (Array.isArray(value)) {
    if (typeof key === "number") {
      const index = key < 0 ? value.length + key : key;
      return index >= 0 && index < value.length ? [value[index]] : [];
    }
    return key === "length" ? [value.length] : [];
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = String(key);
    return Object.hasOwn(record, name) ? [record[name]] : [];
  }
  return [];
}

function descendants(value: unknown): unknown[] {
  const out: unknown[] = [value];
  for (const next of children(value)) out.push(...descendants(next));
  return out;
}

function compare(left: unknown, op: Comparison, right: unknown): boolean {
  switch (op) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    default: {
      if (typeof left !== typeof right) return false;
      if (typeof left !== "number" && typeof left !== "string") return false;
      const l = left as number | string;
      const r = right as number | string;
      if (op === "<") return l < r;
      if (op === "<=") return l <= r;
      if (op === ">") return l > r;
      return l >= r;
    }
  }
}

function matchesFilter(
  item: unknown,
  segment: Extract<Segment, { kind: "filter" }>,
): boolean {
  let current: unknown[] = [item];
  for (const key of segment.path)
    current = current.flatMap((v) => child(v, key));
  if (current.length === 0) return false;
  if (!segment.op) return Boolean(current[0]);
  return compare(current[0], segment.op, segment.value);
}

/** Every node `path` selects in `value`, in document order. */
export function queryJsonPath(value: unknown, path: string): unknown[] {
  let nodes: unknown[] = [value];
  for (const segment of parseJsonPath(path)) {
    switch (segment.kind) {
      case "child":
        nodes = nodes.flatMap((n) => segment.keys.flatMap((k) => child(n, k)));
        break;
      case "wildcard":
        nodes = nodes.flatMap(children);
        break;
      case "descend":
        nodes = nodes
          .flatMap(descendants)
          .flatMap((n) =>
            segment.key === "*" ? children(n) : child(n, segment.key),
          );
        break;
      case "recurse":
        nodes = nodes.flatMap(descendants);
        break;
      case "filter":
        nodes = nodes.flatMap((n) =>
          children(n).filter((item) => matchesFilter(item, segment)),
        );
        break;
    }
  }
  return nodes;
}

/** The match of `path`: undefined for none, the value for one, an array for many. */
// Paths that can match many nodes always return an array.
function isDefinite(path: string): boolean {
  return parseJsonPath(path).every(
    (segment) => segment.kind === "child" && segment.keys.length === 1,
  );
}

export function applyJsonPath<T = unknown>(value: unknown, path: string): T {
  const results = queryJsonPath(value, path);
  if (!isDefinite(path)) return results as T;
  return results[0] as T;
}
