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
    if (whole) return lookupPath(scope, whole[1]);
    return value.replaceAll(EMBEDDED_EXPRESSION, (_, path: string) =>
      interpolate(lookupPath(scope, path)),
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
