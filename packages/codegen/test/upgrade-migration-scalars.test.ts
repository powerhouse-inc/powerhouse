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

function planFor(field: string, extraSdl = "") {
  return buildMigrationPlan({
    previousSpec,
    specification: spec(
      `${extraSdl}type TestState {\n  title: String!\n  ${field}\n}`,
      '{"title":""}',
    ),
    stateName: "TestState",
    localStateName: "TestLocalState",
  });
}

describe("migration zero values for custom scalars", () => {
  it.each(["PHID!", "Amount_Money!", "EthereumAddress!", "JSONObject!"])(
    "asks for a manual migration when a %s field is added",
    (type) => {
      expect(planFor(`added: ${type}`).kind).toBe("manual");
    },
  );

  it("asks for a manual migration for a scalar the schema declares", () => {
    expect(planFor("added: Local!", "scalar Local\n\n").kind).toBe("manual");
  });

  it("still fills a built-in scalar with its zero value", () => {
    expect(planFor("added: Int!")).toEqual({
      kind: "fill",
      fills: { global: { added: 0 } },
    });
  });
});
