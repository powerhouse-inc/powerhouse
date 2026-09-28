// Branch operators, after Activepieces' BranchOperator: one explicit operator
// over typed operands. A wrongly typed operand fails the step, never coerces.

export type BranchOperandType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "list"
  | "any";

export interface BranchOperatorSpec {
  label: string;
  // What `left` must hold; `right` is read as the same type, text for lists.
  left: BranchOperandType;
  // Whether `right` is read at all.
  binary: boolean;
  // Whether `caseSensitive` applies.
  text: boolean;
  test: (left: unknown, right: unknown, caseSensitive: boolean) => boolean;
}

export class BranchConfigError extends Error {
  constructor(message: string) {
    super(`Branch: ${message}`);
    this.name = "BranchConfigError";
  }
}

function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function asText(value: unknown, side: string, caseSensitive: boolean): string {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    throw new BranchConfigError(`${side} must be text, got ${describe(value)}`);
  }
  const text = String(value);
  return caseSensitive ? text : text.toLowerCase();
}

const DECIMAL = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

function asNumber(value: unknown, side: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && DECIMAL.test(value.trim())) {
    return Number(value.trim());
  }
  throw new BranchConfigError(
    `${side} must be a number, got ${describe(value)}`,
  );
}

function asBoolean(value: unknown, side: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new BranchConfigError(
    `${side} must be true or false, got ${describe(value)}`,
  );
}

function asDate(value: unknown, side: string): number {
  const time =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Date.parse(value)
        : Number.NaN;
  if (!Number.isFinite(time)) {
    throw new BranchConfigError(
      `${side} must be a date, got ${describe(value)}`,
    );
  }
  return time;
}

function asList(value: unknown, side: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new BranchConfigError(`${side} must be a list, got ${describe(value)}`);
}

const blank = (value: unknown) =>
  value === undefined || value === null || value === "";

function textOp(
  label: string,
  test: (left: string, right: string) => boolean,
): BranchOperatorSpec {
  return {
    label,
    left: "text",
    binary: true,
    text: true,
    test: (left, right, caseSensitive) =>
      test(
        asText(left, "left", caseSensitive),
        asText(right, "right", caseSensitive),
      ),
  };
}

function numberOp(
  label: string,
  test: (left: number, right: number) => boolean,
): BranchOperatorSpec {
  return {
    label,
    left: "number",
    binary: true,
    text: false,
    test: (left, right) =>
      test(asNumber(left, "left"), asNumber(right, "right")),
  };
}

function dateOp(
  label: string,
  test: (left: number, right: number) => boolean,
): BranchOperatorSpec {
  return {
    label,
    left: "date",
    binary: true,
    text: false,
    test: (left, right) => test(asDate(left, "left"), asDate(right, "right")),
  };
}

function unary(
  label: string,
  left: BranchOperandType,
  test: (left: unknown) => boolean,
): BranchOperatorSpec {
  return { label, left, binary: false, text: false, test };
}

function listHas(
  left: unknown,
  right: unknown,
  caseSensitive: boolean,
): boolean {
  const wanted = asText(right, "right", caseSensitive);
  return asList(left, "left").some((item) => {
    if (typeof item === "object" && item !== null) return false;
    const text = String(item);
    return (caseSensitive ? text : text.toLowerCase()) === wanted;
  });
}

// In the order the editor lists them.
export const BRANCH_OPERATORS = {
  TEXT_EXACTLY_MATCHES: textOp("Text is exactly", (a, b) => a === b),
  TEXT_DOES_NOT_EXACTLY_MATCH: textOp("Text is not exactly", (a, b) => a !== b),
  TEXT_CONTAINS: textOp("Text contains", (a, b) => a.includes(b)),
  TEXT_DOES_NOT_CONTAIN: textOp(
    "Text does not contain",
    (a, b) => !a.includes(b),
  ),
  TEXT_STARTS_WITH: textOp("Text starts with", (a, b) => a.startsWith(b)),
  TEXT_DOES_NOT_START_WITH: textOp(
    "Text does not start with",
    (a, b) => !a.startsWith(b),
  ),
  TEXT_ENDS_WITH: textOp("Text ends with", (a, b) => a.endsWith(b)),
  TEXT_DOES_NOT_END_WITH: textOp(
    "Text does not end with",
    (a, b) => !a.endsWith(b),
  ),
  NUMBER_IS_EQUAL_TO: numberOp("Number equals", (a, b) => a === b),
  NUMBER_IS_GREATER_THAN: numberOp("Number is greater than", (a, b) => a > b),
  NUMBER_IS_LESS_THAN: numberOp("Number is less than", (a, b) => a < b),
  DATE_IS_EQUAL: dateOp("Date is", (a, b) => a === b),
  DATE_IS_BEFORE: dateOp("Date is before", (a, b) => a < b),
  DATE_IS_AFTER: dateOp("Date is after", (a, b) => a > b),
  BOOLEAN_IS_TRUE: unary("Is true", "boolean", (v) => asBoolean(v, "left")),
  BOOLEAN_IS_FALSE: unary("Is false", "boolean", (v) => !asBoolean(v, "left")),
  LIST_CONTAINS: {
    label: "List contains",
    left: "list",
    binary: true,
    text: true,
    test: listHas,
  },
  LIST_DOES_NOT_CONTAIN: {
    label: "List does not contain",
    left: "list",
    binary: true,
    text: true,
    test: (left, right, caseSensitive) => !listHas(left, right, caseSensitive),
  },
  LIST_IS_EMPTY: unary(
    "List is empty",
    "list",
    (v) => asList(v, "left").length === 0,
  ),
  LIST_IS_NOT_EMPTY: unary(
    "List is not empty",
    "list",
    (v) => asList(v, "left").length > 0,
  ),
  EXISTS: unary("Exists", "any", (v) => !blank(v)),
  DOES_NOT_EXIST: unary("Does not exist", "any", blank),
} satisfies Record<string, BranchOperatorSpec>;

export type BranchOperator = keyof typeof BRANCH_OPERATORS;

const OPERATORS: Record<string, BranchOperatorSpec> = BRANCH_OPERATORS;

export const DEFAULT_BRANCH_OPERATOR: BranchOperator = "TEXT_EXACTLY_MATCHES";

export interface BranchOutcome {
  operator: BranchOperator;
  left: unknown;
  right?: unknown;
  result: boolean;
}

// Config: { operator, left, right?, caseSensitive? }, expressions resolved.
export function evaluateBranch(config: unknown): BranchOutcome {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new BranchConfigError("the config must be an object");
  }
  const { operator, left, right, caseSensitive } = config as Record<
    string,
    unknown
  >;
  if (operator === undefined || operator === null || operator === "") {
    throw new BranchConfigError("an operator is required");
  }
  if (typeof operator !== "string" || !Object.hasOwn(OPERATORS, operator)) {
    throw new BranchConfigError(`unknown operator ${describe(operator)}`);
  }
  if (caseSensitive !== undefined && typeof caseSensitive !== "boolean") {
    throw new BranchConfigError("caseSensitive must be true or false");
  }
  const spec = OPERATORS[operator];
  const result = spec.test(left, right, caseSensitive === true);
  return {
    operator: operator as BranchOperator,
    left,
    ...(spec.binary ? { right } : {}),
    result,
  };
}
