import type { CellKey } from "./expand.js";
import type { Match, Rule } from "./schema.js";

export function matches(match: Match, values: Record<string, string>): boolean {
  return Object.entries(match).every(([axis, wanted]) => {
    const value = values[axis];
    return typeof wanted === "string"
      ? value === wanted
      : wanted.includes(value);
  });
}

function describe(match: Match): string {
  return Object.entries(match)
    .map(([axis, wanted]) =>
      typeof wanted === "string"
        ? `${axis}=${wanted}`
        : `${axis}∈{${wanted.join(",")}}`,
    )
    .join(" and ");
}

/** Why the first rule that drops this cell drops it, if one does. */
export function ruleSkip(
  rules: readonly Rule[],
  values: Record<string, string>,
): string | undefined {
  for (const [index, rule] of rules.entries()) {
    const label = `rule ${index + 1}${rule.reason ? ` (${rule.reason})` : ""}`;
    if (rule.kind === "exclude" && matches(rule.when, values)) {
      return `${label}: excludes ${describe(rule.when)}`;
    }
    if (
      rule.kind === "require" &&
      matches(rule.if, values) &&
      !matches(rule.then, values)
    ) {
      return `${label}: ${describe(rule.if)} requires ${describe(rule.then)}`;
    }
  }
  return undefined;
}

export function applyRules(
  cells: readonly CellKey[],
  rules: readonly Rule[],
): (CellKey & { skip?: string })[] {
  return cells.map((cell) => {
    const skip = ruleSkip(rules, cell.values);
    return skip === undefined ? cell : { ...cell, skip };
  });
}
