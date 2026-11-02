import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { defineDocumentModel, materialize, ph } from "document-model";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { generateDocumentModelZodSchemas } from "../../src/codegen/graphql.js";
import type { DocumentModelFileMakerArgs } from "../../src/file-builders/types.js";

const Tone = ph.enum("Tone", { values: ["LOW", "HIGH"] });
const Inner = ph.input("ProbeInner", { fields: { a: ph.String() } });
const model = defineDocumentModel({
  id: "test/validator-parity",
  name: "Probe",
  description: "",
  extension: ".probe",
  version: 1,
  author: { name: "Powerhouse" },
  scopes: {
    global: {
      schema: ph.object("ProbeState", {
        fields: {
          title: ph.String(),
          items: ph.list(ph.String(), { required: true }),
          tone: ph.ref(Tone),
          contact: ph.EmailAddress(),
        },
      }),
      initialValue: { title: null, items: [], tone: null, contact: null },
    },
    local: { schema: null, initialValue: {} },
  },
});
const probe = model.module("probe", {
  operations: ({ global }) => ({
    probe: global({
      input: ph.input({
        fields: {
          title: ph.String(),
          tags: ph.list(ph.String()),
          inners: ph.list(ph.ref(Inner)),
          count: ph.Int({ required: true, defaultValue: 3 }),
          tone: ph.ref(Tone, { required: true }),
        },
      }),
      reduce() {},
    }),
  }),
});
const Probe = materialize(
  model.version({ modules: [probe] }),
) as unknown as DocumentModelModule;

type Generated = Record<
  "ProbeStateSchema" | "ProbeInputSchema",
  () => z.ZodType
>;

let workDir: string;
let generated: Generated;

beforeAll(async () => {
  const outputDir = join(import.meta.dirname, "../../.test-output");
  mkdirSync(outputDir, { recursive: true });
  workDir = mkdtempSync(join(outputDir, "validator-parity-"));
  const schemaDirPath = join(workDir, "gen", "schema");
  mkdirSync(schemaDirPath, { recursive: true });
  await generateDocumentModelZodSchemas({
    specification: Probe.documentModel.global.specifications[0],
    schemaDirPath,
    versionDirPath: workDir,
    projectDir: workDir,
  } as DocumentModelFileMakerArgs);
  generated = (await import(join(schemaDirPath, "zod.ts"))) as Generated;
});

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

type Case = readonly [string, unknown];

function acceptsState(global: unknown) {
  return Probe.utils.isStateOfType({
    ...Probe.utils.createState(),
    global,
  } as never);
}

function acceptsInput(input: unknown) {
  try {
    (Probe.actions as Record<string, (input: unknown) => unknown>).probe(input);
    return true;
  } catch {
    return false;
  }
}

const verdicts = (
  schema: () => z.ZodType,
  accepts: (value: unknown) => boolean,
  cases: readonly Case[],
) =>
  cases.map(([name, value]) => [
    name,
    schema().safeParse(value).success,
    accepts(value),
  ]);

const base = { title: null, items: [], tone: null, contact: null };
const input = { tone: "LOW", count: 1 };

describe("a code-first model against the schema-first generator for its stored specification", () => {
  it("accepts and rejects the same stored states", () => {
    expect(
      verdicts(() => generated.ProbeStateSchema(), acceptsState, [
        ["every nullable field null", base],
        ["a nullable field absent", { items: [] }],
        ["a nullable list item", { ...base, items: [null] }],
        ["an undefined list item", { ...base, items: [undefined] }],
        ["a required field absent", { title: "t" }],
        ["an enum value", { ...base, tone: "HIGH" }],
        ["an unknown enum value", { ...base, tone: "MID" }],
        ["an email", { ...base, contact: "a@b.co" }],
        ["a malformed email", { ...base, contact: "nope" }],
      ]),
    ).toStrictEqual([
      ["every nullable field null", true, true],
      ["a nullable field absent", true, true],
      ["a nullable list item", true, true],
      ["an undefined list item", false, false],
      ["a required field absent", false, false],
      ["an enum value", true, true],
      ["an unknown enum value", false, false],
      ["an email", true, true],
      ["a malformed email", false, false],
    ]);
  });

  it("accepts and rejects the same operation inputs", () => {
    expect(
      verdicts(() => generated.ProbeInputSchema(), acceptsInput, [
        ["only the required fields", input],
        ["a nullable field null", { ...input, title: null }],
        ["a nullable scalar item", { ...input, tags: [null] }],
        ["an undefined scalar item", { ...input, tags: [undefined] }],
        ["a nullable input item", { ...input, inners: [null] }],
        ["an undefined input item", { ...input, inners: [undefined] }],
        ["a nested nullable field absent", { ...input, inners: [{}] }],
        ["a defaulted required field absent", { tone: "LOW" }],
        ["a required enum absent", { count: 1 }],
        ["a wrongly typed field", { ...input, count: "1" }],
      ]),
    ).toStrictEqual([
      ["only the required fields", true, true],
      ["a nullable field null", true, true],
      ["a nullable scalar item", true, true],
      ["an undefined scalar item", false, false],
      ["a nullable input item", true, true],
      ["an undefined input item", false, false],
      ["a nested nullable field absent", true, true],
      ["a defaulted required field absent", true, true],
      ["a required enum absent", false, false],
      ["a wrongly typed field", false, false],
    ]);
  });
});
