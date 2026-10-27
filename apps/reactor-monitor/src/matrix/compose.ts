import type { HostExport } from "@powerhousedao/host-core/schema";
import { parseHostExport } from "../lib/host-import.js";
import {
  capabilityIssues,
  conflicts,
  ladderCombos,
  requirements,
  storageModeCombos,
  type Selected,
} from "./builtins.js";
import { expand, type CellKey } from "./expand.js";
import { checkEnvKey, checkSetterPath, checkSetterValue } from "./policy.js";
import { applyRules } from "./rules.js";
import {
  attachMode,
  isDelete,
  MATRIX_LIMITS,
  type Attach,
  type Capabilities,
  type Cell,
  type Combo,
  type Expectation,
  type MatrixDefinition,
  type MatrixIssue,
  type Requirement,
  type Setter,
} from "./schema.js";
import { applySetters, type SetterSource } from "./setters.js";
import { cellVerdict } from "./verdict.js";

export type ComposedCell = CellKey & {
  attach: Attach;
  expect: Expectation;
  /** Present once setters applied; absent when policy or a setter refused. */
  envelope?: HostExport;
  env: Record<string, string>;
  requires: Requirement[];
  storageEngine?: "pglite" | "postgres";
  issues: MatrixIssue[];
  combos: Combo[];
  /** A rule, or a built-in combo outside negative tests. */
  skip?: string;
};

function selectedOf(
  definition: MatrixDefinition,
  values: Record<string, string>,
): Selected[] {
  return definition.axes.map((axis) => {
    const value = axis.values.find(
      (candidate) => candidate.key === values[axis.key],
    );
    if (!value)
      throw new Error(`axis "${axis.key}" has no value "${values[axis.key]}"`);
    return { axis, value };
  });
}

function attachOf(
  definition: MatrixDefinition,
  selected: readonly Selected[],
): Attach {
  return (
    selected.find(({ value }) => value.attach)?.value.attach ??
    definition.attach
  );
}

function policyIssues(selected: readonly Selected[]): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  for (const { axis, value } of selected) {
    const source = { axis: axis.key, value: value.key };
    for (const setter of value.setters) {
      const op = isDelete(setter.value) ? "delete" : "set";
      const verdicts = [
        checkSetterPath(setter.path, op),
        ...(op === "set" ? [checkSetterValue(setter.value)] : []),
      ];
      for (const verdict of verdicts) {
        if (verdict.ok) continue;
        issues.push({
          stage: "policy",
          path: setter.path,
          message: verdict.reason,
          ...source,
        });
      }
    }
    for (const key of Object.keys(value.env)) {
      const verdict = checkEnvKey(key);
      if (verdict.ok) continue;
      issues.push({
        stage: "policy",
        path: `env.${key}`,
        message: verdict.reason,
        ...source,
      });
    }
  }
  return issues;
}

/** Policy and conflicts, setters, shape, capability, then built-in combos. */
export function composeCell(
  definition: MatrixDefinition,
  base: HostExport,
  key: CellKey,
  capabilities: Capabilities,
): ComposedCell {
  const selected = selectedOf(definition, key.values);
  const attach = attachOf(definition, selected);
  const env = Object.assign(
    {},
    ...selected.map(({ value }) => value.env),
  ) as Record<string, string>;
  const storageEngine = selected.find(({ value }) => value.expect.storageEngine)
    ?.value.expect.storageEngine;
  const cell: ComposedCell = {
    ...key,
    attach,
    expect: "accept",
    env,
    requires: [],
    ...(storageEngine ? { storageEngine } : {}),
    issues: [],
    combos: [],
  };
  const refused = [...policyIssues(selected), ...conflicts(selected)];
  if (refused.length > 0) return { ...cell, issues: refused };

  const setters: Setter[] = [];
  const sources: SetterSource[] = [];
  for (const { axis, value } of selected) {
    for (const setter of value.setters) {
      setters.push(setter);
      sources.push({ axis: axis.key, value: value.key });
    }
  }
  const applied = applySetters(base, setters, sources);
  if (applied.issues.length > 0) return { ...cell, issues: applied.issues };
  const envelope = applied.envelope;

  const shape = parseHostExport(JSON.stringify(envelope)).issues.map(
    (issue): MatrixIssue => ({
      stage: "shape",
      file: issue.file,
      path: issue.path,
      message: issue.message,
    }),
  );
  if (shape.length > 0) return { ...cell, envelope, issues: shape };

  const requires = requirements(envelope, selected, attach);
  const missing = capabilityIssues(requires, capabilities);
  if (missing.length > 0)
    return { ...cell, envelope, requires, issues: missing };

  const combos = [
    ...ladderCombos(envelope),
    ...storageModeCombos(envelope, attach),
  ];
  if (combos.length === 0) return { ...cell, envelope, requires };
  if (definition.negativeTests) {
    return { ...cell, envelope, requires, combos, expect: "refusal" };
  }
  const skip = `built-in invalid combination: ${combos.map((combo) => combo.message).join("; ")}`;
  return { ...cell, envelope, requires, combos, skip };
}

export type MatrixPlan = {
  cells: ComposedCell[];
  /** Instances the runnable cells need, per attach mode. */
  instances: { remote: number; browser: number };
  /** Set when the plan exceeds MATRIX_LIMITS.instances. */
  limit?: string;
};

export function isRunnable(cell: ComposedCell): boolean {
  return cell.skip === undefined && cell.issues.length === 0;
}

export function planMatrix(
  definition: MatrixDefinition,
  base: HostExport,
  capabilities: Capabilities,
): MatrixPlan {
  const cells = applyRules(expand(definition.axes), definition.rules).map(
    (key): ComposedCell => {
      if (key.skip === undefined) {
        return composeCell(definition, base, key, capabilities);
      }
      const attach = attachOf(definition, selectedOf(definition, key.values));
      return {
        ...key,
        attach,
        expect: "accept",
        env: {},
        requires: [],
        issues: [],
        combos: [],
      };
    },
  );
  const instances = { remote: 0, browser: 0 };
  for (const cell of cells) {
    if (!isRunnable(cell)) continue;
    const mode =
      attachMode(cell.attach) === "controller" ? "remote" : "browser";
    instances[mode] += definition.repetitions;
  }
  const total = instances.remote + instances.browser;
  const limit =
    total > MATRIX_LIMITS.instances
      ? `${total} instances (cells × repetitions); at most ${MATRIX_LIMITS.instances}`
      : undefined;
  return { cells, instances, ...(limit ? { limit } : {}) };
}

/** Decided cells start done; the rest start with queued reps. */
export function initialCell(
  composed: ComposedCell,
  definition: MatrixDefinition,
): Cell {
  const cell: Cell = {
    id: composed.id,
    values: composed.values,
    attach: composed.attach,
    credentialVerification: definition.credentialVerification,
    expect: composed.expect,
    status: "pending",
    combos: composed.combos,
    issues: composed.issues,
    reps: [],
    flaky: false,
  };
  if (!isRunnable(composed)) {
    const verdict = cellVerdict({ ...cell, skip: composed.skip });
    return {
      ...cell,
      status: "done",
      outcome: verdict.outcome,
      reason: verdict.reason,
    };
  }
  for (let rep = 1; rep <= definition.repetitions; rep++) {
    cell.reps.push({
      rep,
      status: "queued",
      checks: [],
      issues: [],
      timings: {},
    });
  }
  return cell;
}
