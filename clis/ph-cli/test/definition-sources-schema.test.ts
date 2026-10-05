import { parseDefinitionSourcesConfig } from "@powerhousedao/shared/clis/definition-sources";
import { sourceConfigSchema } from "@powerhousedao/shared/clis";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";

const validateConfig = new Ajv({ strict: false }).compile(sourceConfigSchema);

type Case = {
  readonly name: string;
  readonly definitionSources: unknown;
  readonly valid: boolean;
  readonly decidedBy: "envelope" | "entry";
};

const cases: readonly Case[] = [
  {
    name: "code-first with one entry",
    definitionSources: {
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./src/document-models/invoice.ts" }],
    },
    valid: true,
    decidedBy: "envelope",
  },
  {
    name: "code-first with an export path",
    definitionSources: {
      formatVersion: 1,
      mode: "code-first",
      entries: [
        {
          specifier: "./src/subgraphs/billing.ts",
          exportPath: ["billingSubgraph"],
        },
      ],
    },
    valid: true,
    decidedBy: "envelope",
  },
  {
    name: "explicit schema-first",
    definitionSources: { formatVersion: 1, mode: "schema-first" },
    valid: true,
    decidedBy: "envelope",
  },
  {
    name: "code-first with an empty entry list",
    definitionSources: { formatVersion: 1, mode: "code-first", entries: [] },
    valid: false,
    decidedBy: "envelope",
  },
  {
    name: "schema-first carrying entries",
    definitionSources: {
      formatVersion: 1,
      mode: "schema-first",
      entries: [{ specifier: "./src/models.ts" }],
    },
    valid: false,
    decidedBy: "envelope",
  },
  {
    name: "an unsupported format version",
    definitionSources: { formatVersion: 2, mode: "schema-first" },
    valid: false,
    decidedBy: "envelope",
  },
  {
    name: "an unknown mode",
    definitionSources: { formatVersion: 1, mode: "auto" },
    valid: false,
    decidedBy: "envelope",
  },
  {
    name: "an absolute specifier",
    definitionSources: {
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "/abs/src/models.ts" }],
    },
    valid: false,
    decidedBy: "entry",
  },
  {
    name: "an unsupported entry property",
    definitionSources: {
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./src/models.ts", watch: true }],
    },
    valid: false,
    decidedBy: "entry",
  },
];

describe("definitionSources schema and narrowing agree", () => {
  for (const testCase of cases) {
    it(`${testCase.valid ? "accepts" : "rejects"} ${testCase.name}`, () => {
      expect(
        validateConfig({ definitionSources: testCase.definitionSources }),
      ).toBe(testCase.valid);
    });
  }

  it("reaches the same verdict as the runtime narrowing on every envelope case", () => {
    const envelopeCases = cases.filter(
      (testCase) => testCase.decidedBy === "envelope",
    );
    const verdicts = envelopeCases.map((testCase) => ({
      name: testCase.name,
      schema: validateConfig({ definitionSources: testCase.definitionSources }),
      narrowing: parseDefinitionSourcesConfig(testCase.definitionSources).ok,
    }));
    expect(verdicts.filter((v) => v.schema !== v.narrowing)).toEqual([]);
  });

  it("treats an absent field as a package that has not chosen yet", () => {
    expect(validateConfig({})).toBe(true);
    expect(parseDefinitionSourcesConfig(undefined)).toMatchObject({
      ok: false,
      reason: "missing",
    });
  });
});
