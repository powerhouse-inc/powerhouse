import type {
  DefinitionPath,
  ScalarRepresentation,
} from "@powerhousedao/shared/document-model";
import { snapshotRecord } from "../data-properties.js";
import { canonicalJson } from "../primitives.js";
import { PROFILE } from "./declaration.js";

/** One way a wire `ScalarDefinition` departs from the shape `defineScalar` emits. */
export type ScalarDefinitionIssue = {
  readonly path: DefinitionPath;
  readonly message: string;
  readonly received: string;
};

const DEFINITION_KEYS = [
  "kind",
  "formatVersion",
  "name",
  "representation",
  "persistable",
  "description",
  "zero",
  "coercion",
  "coercionProfile",
] as const;

const REPRESENTATIONS: readonly ScalarRepresentation[] = [
  "string",
  "number",
  "boolean",
  "json-object",
  "json",
  "opaque",
];

function describe(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  return typeof value;
}

/**
 * Checks the definition a package scalar reference carries. A package scalar
 * has no catalog entry to be compared with, so its definition is the whole
 * contract and is checked member by member.
 */
export function scalarDefinitionIssues(
  value: unknown,
  name: string,
  path: DefinitionPath,
): readonly ScalarDefinitionIssue[] {
  const snapshot = snapshotRecord(value, DEFINITION_KEYS, path);
  if (!snapshot.ok) {
    return [
      {
        path: snapshot.path,
        message: `A scalar definition is a plain object with the V1 members (${snapshot.reason}).`,
        received: describe(value),
      },
    ];
  }
  const node = snapshot.value;
  const issues: ScalarDefinitionIssue[] = [];
  const expect = (
    ok: boolean,
    key: (typeof DEFINITION_KEYS)[number],
    message: string,
  ) => {
    if (!ok) {
      issues.push({
        path: [...path, key],
        message,
        received: describe(node[key]),
      });
    }
  };
  expect(
    node.kind === "powerhouse.scalar",
    "kind",
    "A scalar definition is tagged powerhouse.scalar.",
  );
  expect(node.formatVersion === 1, "formatVersion", "The format version is 1.");
  expect(
    node.name === name,
    "name",
    `The definition names ${name}, the scalar that references it.`,
  );
  expect(
    REPRESENTATIONS.includes(node.representation as ScalarRepresentation),
    "representation",
    `The representation is one of ${REPRESENTATIONS.join(", ")}.`,
  );
  expect(
    typeof node.persistable === "boolean",
    "persistable",
    "persistable is a boolean.",
  );
  expect(
    typeof node.description === "string" && node.description !== "",
    "description",
    "A scalar has a description.",
  );
  expect(isZero(node.zero), "zero", "zero is a value or a reasoned none.");
  const coercion = snapshotRecord(node.coercion, ["source"], []);
  expect(
    coercion.ok &&
      (coercion.value.source === "derived" ||
        coercion.value.source === "explicit"),
    "coercion",
    "coercion records whether it was derived or explicit.",
  );
  expect(
    node.coercionProfile === PROFILE,
    "coercionProfile",
    `The coercion profile is ${PROFILE}.`,
  );
  return issues;
}

function isZero(value: unknown): boolean {
  const zero = snapshotRecord(value, ["kind", "value", "reason"], []);
  if (!zero.ok) return false;
  if (zero.value.kind === "none") {
    return typeof zero.value.reason === "string" && zero.value.reason !== "";
  }
  if (zero.value.kind !== "value" || !Object.hasOwn(zero.value, "value")) {
    return false;
  }
  try {
    canonicalJson(zero.value.value);
    return true;
  } catch {
    return false;
  }
}
