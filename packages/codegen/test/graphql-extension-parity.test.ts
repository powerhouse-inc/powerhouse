import type {
  DocumentModelModule,
  DocumentSpecification,
} from "@powerhousedao/shared/document-model";
import { defineDocumentModel, ph } from "document-model";
import { schemaFirstGraphQLDocument } from "document-model/tooling";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { generateDocumentModelZodSchemas } from "../src/codegen/graphql.js";
import type { DocumentModelFileMakerArgs } from "../src/file-builders/index.mts";

const STATE_SDL = [
  "enum ProbeStatus { OPEN }",
  "extend enum ProbeStatus { CLOSED }",
  "type Cat { meows: Boolean! }",
  "type Dog { barks: Boolean! }",
  "union Pet = Cat",
  "extend union Pet = Dog",
  "type ProbeState { title: String! status: ProbeStatus! pet: Pet }",
  "extend type ProbeState { extra: Int }",
].join("\n");

const INPUT_SDL = [
  "input SetTitleInput { title: String! }",
  "extend input SetTitleInput { note: String status: ProbeStatus }",
  "extend type ProbeState { flagged: Boolean! }",
].join("\n");

function specification(): DocumentSpecification {
  return {
    version: 1,
    changeLog: [],
    state: {
      global: { schema: STATE_SDL, initialValue: "{}", examples: [] },
      local: { schema: "", initialValue: "", examples: [] },
    },
    modules: [
      {
        name: "titles",
        operations: [{ name: "SET_TITLE", schema: INPUT_SDL }],
      },
    ],
  } as unknown as DocumentSpecification;
}

function codeFirstModel(): DocumentModelModule {
  const ProbeStatus = ph.enum("ProbeStatus", { values: ["OPEN", "CLOSED"] });
  const Cat = ph.object("Cat", {
    fields: { meows: ph.Boolean({ required: true }) },
  });
  const Dog = ph.object("Dog", {
    fields: { barks: ph.Boolean({ required: true }) },
  });
  const Pet = ph.union("Pet", { members: [Cat, Dog] });
  const context = defineDocumentModel({
    id: "test/graphql-extension-parity",
    name: "Probe",
    description: "",
    extension: "probe",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      graphQLCompatibility: schemaFirstGraphQLDocument([STATE_SDL, INPUT_SDL]),
      global: {
        schema: ph.object("ProbeState", {
          fields: {
            title: ph.String({ required: true }),
            status: ph.ref(ProbeStatus, { required: true }),
            pet: ph.ref(Pet),
            extra: ph.Int(),
            flagged: ph.Boolean({ required: true }),
          },
        }),
        initialValue: {
          title: "",
          status: "OPEN",
          pet: null,
          extra: null,
          flagged: false,
        },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const titles = context.module("titles", {
    operations: ({ global }) => ({
      setTitle: global({
        input: ph.input({
          fields: {
            title: ph.String({ required: true }),
            note: ph.String(),
            status: ph.ref(ProbeStatus),
          },
        }),
        reduce(state, input) {
          state.title = input.title;
        },
      }),
    }),
  });
  return context.finalize({
    modules: [titles],
  }) as unknown as DocumentModelModule;
}

type Generated = {
  readonly ProbeStateSchema: () => z.ZodType;
  readonly SetTitleInputSchema: () => z.ZodType;
};

const STATE = {
  title: "t",
  status: "OPEN",
  pet: null,
  extra: null,
  flagged: false,
};

const { extra: _extra, ...STATE_WITHOUT_EXTRA } = STATE;

const STATE_CASES: readonly (readonly [string, Record<string, unknown>])[] = [
  ["base value", STATE],
  ["enum value an extension adds", { ...STATE, status: "CLOSED" }],
  ["enum value nobody declares", { ...STATE, status: "BOGUS" }],
  ["union member an extension adds", { ...STATE, pet: { barks: true } }],
  ["base union member", { ...STATE, pet: { meows: true } }],
  ["extension field, valid", { ...STATE, extra: 3 }],
  ["extension field, wrong type", { ...STATE, extra: "x" }],
  ["extension field, absent", STATE_WITHOUT_EXTRA],
  ["field an operation segment adds, valid", { ...STATE, flagged: true }],
  ["field an operation segment adds, null", { ...STATE, flagged: null }],
];

const INPUT_CASES: readonly (readonly [string, Record<string, unknown>])[] = [
  ["base field only", { title: "t" }],
  ["extension field, valid", { title: "t", note: "n" }],
  ["extension field, null", { title: "t", note: null }],
  ["extension field, wrong type", { title: "t", note: 42 }],
  ["extension enum value", { title: "t", status: "CLOSED" }],
  ["undeclared enum value", { title: "t", status: "BOGUS" }],
];

let workDir: string;
let generated: Generated;
let model: DocumentModelModule;

beforeAll(async () => {
  mkdirSync(join(import.meta.dirname, ".test-output"), { recursive: true });
  workDir = mkdtempSync(
    join(import.meta.dirname, ".test-output", "graphql-extension-parity-"),
  );
  const schemaDirPath = join(workDir, "gen", "schema");
  mkdirSync(schemaDirPath, { recursive: true });
  await generateDocumentModelZodSchemas({
    specification: specification(),
    schemaDirPath,
    versionDirPath: workDir,
  } as DocumentModelFileMakerArgs);
  generated = (await import(join(schemaDirPath, "zod.ts"))) as Generated;
  model = codeFirstModel();
});

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

function codeFirstAcceptsState(global: Record<string, unknown>): boolean {
  return model.utils.isStateOfType({
    ...model.utils.createState(),
    global,
  } as never);
}

function codeFirstAcceptsInput(input: Record<string, unknown>): boolean {
  try {
    (model.actions as Record<string, (input: unknown) => unknown>).setTitle(
      input,
    );
    return true;
  } catch {
    return false;
  }
}

describe("type extensions against the schema-first generator", () => {
  it("accepts and rejects the same stored states", () => {
    const verdicts = STATE_CASES.map(([name, value]) => [
      name,
      generated.ProbeStateSchema().safeParse(value).success,
      codeFirstAcceptsState(value),
    ]);
    expect(verdicts).toStrictEqual([
      ["base value", true, true],
      ["enum value an extension adds", true, true],
      ["enum value nobody declares", false, false],
      ["union member an extension adds", true, true],
      ["base union member", true, true],
      ["extension field, valid", true, true],
      ["extension field, wrong type", false, false],
      ["extension field, absent", true, true],
      ["field an operation segment adds, valid", true, true],
      ["field an operation segment adds, null", false, false],
    ]);
  });

  it("accepts and rejects the same operation inputs", () => {
    const verdicts = INPUT_CASES.map(([name, value]) => [
      name,
      generated.SetTitleInputSchema().safeParse(value).success,
      codeFirstAcceptsInput(value),
    ]);
    expect(verdicts).toStrictEqual([
      ["base field only", true, true],
      ["extension field, valid", true, true],
      ["extension field, null", true, true],
      ["extension field, wrong type", false, false],
      ["extension enum value", true, true],
      ["undeclared enum value", false, false],
    ]);
  });
});
