// Splits authored text into literal and {{expression}} runs for highlighting.
// Pattern copied from reactor-connectors engine/expressions.ts (node-only pkg).
const EMBEDDED_EXPRESSION = /\{\{\s*([^{}]+?)\s*\}\}/g;

export type ExpressionToken =
  | { kind: "text"; text: string }
  | { kind: "expression"; text: string; expression: string };

export function splitExpressionTokens(value: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let last = 0;
  for (const match of value.matchAll(EMBEDDED_EXPRESSION)) {
    const index = match.index;
    if (index > last) {
      tokens.push({ kind: "text", text: value.slice(last, index) });
    }
    tokens.push({ kind: "expression", text: match[0], expression: match[1] });
    last = index + match[0].length;
  }
  if (last < value.length) {
    tokens.push({ kind: "text", text: value.slice(last) });
  }
  return tokens;
}

export function hasExpressions(value: unknown): value is string {
  return (
    typeof value === "string" && new RegExp(EMBEDDED_EXPRESSION).test(value)
  );
}

export interface ExpressionRef {
  // "steps" carries the step key; the others keep the remaining path.
  root: "steps" | "trigger" | "variables" | "other";
  stepKey?: string;
  // Path after the root (and step key), dotted; "" for the whole subtree.
  rest: string;
  // Only the first `||` term is described; fallbacks stay literal.
  hasFallback: boolean;
}

// Describes the leading term of an expression for a compact chip label.
export function describeExpression(expression: string): ExpressionRef {
  const terms = expression.split("||");
  const path = terms[0].trim();
  const hasFallback = terms.length > 1;
  const segments = path.split(".");
  switch (segments[0]) {
    case "steps":
      return {
        root: "steps",
        stepKey: segments[1] ?? "",
        rest: segments.slice(2).join("."),
        hasFallback,
      };
    case "trigger":
      return {
        root: "trigger",
        rest: segments.slice(1).join("."),
        hasFallback,
      };
    case "variables":
      return {
        root: "variables",
        rest: segments.slice(1).join("."),
        hasFallback,
      };
    default:
      return { root: "other", rest: path, hasFallback };
  }
}
