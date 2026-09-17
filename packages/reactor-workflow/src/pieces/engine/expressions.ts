// Minimal {{path}} expression resolution over the run scope (doc 08 §4.6).
// A whole-string expression yields the raw value; embedded ones interpolate.

export interface ExpressionScope {
  trigger?: unknown;
  steps: Record<string, { output: unknown }>;
  variables: Record<string, unknown>;
}

const WHOLE_EXPRESSION = /^\{\{\s*([^{}]+?)\s*\}\}$/;
const EMBEDDED_EXPRESSION = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function lookupPath(scope: ExpressionScope, path: string): unknown {
  let current: unknown = scope;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const STRING_LITERAL = /^(['"])(.*)\1$/;

// "a.b || c.d || 'default'": first term that isn't undefined/null/"" wins.
export function resolveExpression(
  scope: ExpressionScope,
  expression: string,
): unknown {
  for (const term of expression.split("||")) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    const literal = STRING_LITERAL.exec(trimmed);
    const value = literal ? literal[2] : lookupPath(scope, trimmed);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function interpolate(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value as string | number | boolean);
}

export function resolveExpressions(
  value: unknown,
  scope: ExpressionScope,
): unknown {
  if (typeof value === "string") {
    const whole = WHOLE_EXPRESSION.exec(value);
    if (whole) return resolveExpression(scope, whole[1]);
    return value.replaceAll(EMBEDDED_EXPRESSION, (_, path: string) =>
      interpolate(resolveExpression(scope, path)),
    );
  }
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
  const resolved = resolveExpressions(condition, scope);
  if (resolved === "false" || resolved === "0") return false;
  return Boolean(resolved);
}
