import type { DocumentSpecification } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { buildMigrationPlan } from "../src/file-builders/document-model/upgrade-migration.js";

function spec(schema: string, initialValue: string): DocumentSpecification {
  return {
    version: 1,
    changeLog: [],
    state: {
      global: { schema, initialValue, examples: [] },
      local: { schema: "", initialValue: "", examples: [] },
    },
    modules: [],
  } as unknown as DocumentSpecification;
}

const previousSpec = spec(
  "type TestState {\n  title: String!\n}",
  '{"title":""}',
);

function planFor(field: string, extraSdl = "", initialValue = '{"title":""}') {
  return buildMigrationPlan({
    previousSpec,
    specification: spec(
      `${extraSdl}type TestState {\n  title: String!\n  ${field}\n}`,
      initialValue,
    ),
    stateName: "TestState",
    localStateName: "TestLocalState",
  });
}

const manual = {
  kind: "manual",
  reason:
    'no initial value could be derived for the added global state field "added"',
};

describe("migration plan for an added state field", () => {
  it("asks for a manual migration when a required field has no initial value", () => {
    expect(planFor("added: PHID!")).toStrictEqual(manual);
  });

  it("asks for a manual migration for a scalar the schema declares", () => {
    expect(planFor("added: Local!", "scalar Local\n\n")).toStrictEqual(manual);
  });

  it("fills a required field from the new version's initial value", () => {
    expect(
      planFor("added: PHID!", "", '{"title":"","added":"phd:x"}'),
    ).toStrictEqual({ kind: "fill", fills: { global: { added: "phd:x" } } });
  });

  it("fills a nullable field with null", () => {
    expect(planFor("added: PHID")).toStrictEqual({
      kind: "fill",
      fills: { global: { added: null } },
    });
  });

  it("still fills a built-in scalar with its zero value", () => {
    expect(planFor("added: Int!")).toStrictEqual({
      kind: "fill",
      fills: { global: { added: 0 } },
    });
  });
});
