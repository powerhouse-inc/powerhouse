// Prunes Tailwind's minified output down to what the prerendered shell uses.

type Node =
  | { kind: "statement"; text: string }
  | { kind: "rule"; prelude: string; body: string }
  | { kind: "block"; prelude: string; children: Node[] };

/** Parses minified CSS into statements, leaf rules and nested blocks. */
function parse(css: string): Node[] {
  const nodes: Node[] = [];
  let i = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }
    const open = scan(css, i, "{;");
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    if (css[open] === ";") {
      if (prelude) nodes.push({ kind: "statement", text: `${prelude};` });
      i = open + 1;
      continue;
    }
    const close = matching(css, open);
    const inner = css.slice(open + 1, close);
    nodes.push(
      scan(inner, 0, "{") < 0
        ? { kind: "rule", prelude, body: inner }
        : { kind: "block", prelude, children: parse(inner) },
    );
    i = close + 1;
  }
  return nodes;
}

// The first of `chars` outside quotes and parentheses, or -1.
function scan(css: string, from: number, chars: string) {
  let quote = "";
  let depth = 0;
  for (let i = from; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && chars.includes(c)) return i;
  }
  return -1;
}

function matching(css: string, open: number) {
  let depth = 0;
  let quote = "";
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return css.length;
}

function print(nodes: Node[]): string {
  return nodes
    .map((node) =>
      node.kind === "statement"
        ? node.text
        : node.kind === "rule"
          ? `${node.prelude}{${node.body}}`
          : `${node.prelude}{${print(node.children)}}`,
    )
    .join("");
}

function splitTopLevel(text: string, separator: string) {
  const parts: string[] = [];
  let start = 0;
  for (;;) {
    const at = scan(text, start, separator);
    if (at < 0) break;
    parts.push(text.slice(start, at));
    start = at + 1;
  }
  parts.push(text.slice(start));
  return parts;
}

// Form-control pseudo-elements only apply to these.
const FORM_PSEUDO = /::(placeholder|file-selector-button|-webkit-[\w-]+)/;
const FORM_TAGS = ["input", "textarea", "select"];

/** Whether a preflight selector can match an element of `tags`/`attributes`. */
function selectorApplies(
  selector: string,
  tags: Set<string>,
  attributes: Set<string>,
) {
  // Element names: not after `:`, `.`, `#`, `-` or inside an attribute selector.
  const bare = selector.replace(/\[[^\]]*\]/g, (attr) => {
    const name = /^\[([\w-]+)/.exec(attr)?.[1];
    return name && !attributes.has(name) ? "[missing]" : "";
  });
  if (bare.includes("[missing]")) return false;
  const types = [...bare.matchAll(/(?:^|[\s>+~(,])([a-z][a-z0-9-]*)/g)].map(
    (match) => match[1],
  );
  if (types.some((type) => !tags.has(type))) return false;
  if (FORM_PSEUDO.test(selector)) return FORM_TAGS.some((tag) => tags.has(tag));
  return true;
}

function prunePreflight(
  nodes: Node[],
  tags: Set<string>,
  attributes: Set<string>,
): Node[] {
  return nodes.flatMap((node): Node[] => {
    if (node.kind === "statement") return [node];
    if (node.kind === "block") {
      const children = prunePreflight(node.children, tags, attributes);
      return children.length ? [{ ...node, children }] : [];
    }
    const kept = splitTopLevel(node.prelude, ",").filter((selector) =>
      selectorApplies(selector.trim(), tags, attributes),
    );
    return kept.length ? [{ ...node, prelude: kept.join(",") }] : [];
  });
}

const VAR_REFERENCE = /var\((--[\w-]+)/g;
const references = (text: string) =>
  [...text.matchAll(VAR_REFERENCE)].map((match) => match[1]);

/** Rules that only declare custom properties: theme tokens and resets. */
function isVariableRule(node: Extract<Node, { kind: "rule" }>) {
  return splitTopLevel(node.body, ";").every(
    (declaration) => !declaration.trim() || declaration.trim().startsWith("--"),
  );
}

function declarationsOf(body: string) {
  return splitTopLevel(body, ";").filter((declaration) => declaration.trim());
}

function walk(nodes: Node[], visit: (node: Node) => void) {
  for (const node of nodes) {
    visit(node);
    if (node.kind === "block") walk(node.children, visit);
  }
}

function filterTree(nodes: Node[], keep: (node: Node) => Node | null): Node[] {
  return nodes.flatMap((node): Node[] => {
    const kept = keep(node);
    if (!kept) return [];
    if (kept.kind !== "block" || kept.prelude.startsWith("@keyframes")) {
      return [kept];
    }
    const children = filterTree(kept.children, keep);
    return children.length ? [{ ...kept, children }] : [];
  });
}

/** `css` without the preflight, tokens, `@property` rules and keyframes that
 * `markup` and `extraCss` never reach. */
export function pruneCriticalCss(css: string, markup: string, extraCss = "") {
  const tags = new Set(
    ["html", "body"].concat(
      [...markup.matchAll(/<([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase()),
    ),
  );
  const attributes = new Set(
    [...markup.matchAll(/\s([a-zA-Z][\w-:]*)(?==|[\s>])/g)].map((m) => m[1]),
  );
  let nodes = parse(css).map((node) =>
    node.kind === "block" && node.prelude === "@layer base"
      ? { ...node, children: prunePreflight(node.children, tags, attributes) }
      : node,
  );

  // Custom properties: reached from real declarations, the markup or extraCss.
  const definitions = new Map<string, string[]>();
  const seeds: string[] = [markup, extraCss];
  walk(nodes, (node) => {
    if (node.kind === "rule" && isVariableRule(node)) {
      for (const declaration of declarationsOf(node.body)) {
        const colon = declaration.indexOf(":");
        const name = declaration.slice(0, colon).trim();
        const refs = definitions.get(name) ?? [];
        refs.push(...references(declaration.slice(colon + 1)));
        definitions.set(name, refs);
      }
    } else if (node.kind === "rule") {
      seeds.push(node.body);
    }
  });
  const used = new Set(seeds.flatMap(references));
  for (const name of used) {
    for (const ref of definitions.get(name) ?? []) used.add(ref);
  }

  nodes = filterTree(nodes, (node) => {
    if (node.kind === "rule" && isVariableRule(node)) {
      const kept = declarationsOf(node.body).filter((declaration) =>
        used.has(declaration.slice(0, declaration.indexOf(":")).trim()),
      );
      return kept.length ? { ...node, body: kept.join(";") } : null;
    }
    if (node.kind === "rule" && node.prelude.startsWith("@property ")) {
      return used.has(node.prelude.slice(10).trim()) ? node : null;
    }
    return node;
  });

  // Keyframes: kept when a remaining declaration names them.
  const remaining = print(
    filterTree(nodes, (node) =>
      node.kind === "block" && node.prelude.startsWith("@keyframes")
        ? null
        : node,
    ),
  ).concat(extraCss, markup);
  return print(
    filterTree(nodes, (node) => {
      if (node.kind !== "block" || !node.prelude.startsWith("@keyframes")) {
        return node;
      }
      const name = node.prelude.slice(10).trim();
      return new RegExp(
        `(animation[\\w-]*:|--animate-[\\w-]+:)[^;}]*\\b${name}\\b`,
      ).test(remaining)
        ? node
        : null;
    }),
  );
}
