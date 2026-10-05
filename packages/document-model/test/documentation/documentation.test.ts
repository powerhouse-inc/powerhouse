import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFINITION_DIAGNOSTIC_CODES } from "../../src/definition/diagnostics.js";
import {
  HexColor,
  Item,
  Label,
  Priority,
  requiredRule,
  todoFamily,
} from "./samples.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(
  HERE,
  "..",
  "..",
  "..",
  "..",
  "apps",
  "academy",
  "docs",
  "academy",
  "04-Reference",
  "02-DocumentModels",
  "01-CodeFirst",
);

function page(name: string): string {
  return readFileSync(join(DOCS, name), "utf8");
}

describe("the diagnostics reference", () => {
  const reference = page("04-Diagnostics.md");

  it("documents every code in the catalog", () => {
    const documented = new Set(
      [...reference.matchAll(/^\| `(PH-[A-Z0-9-]+)` \|/gm)].map(
        (match) => match[1],
      ),
    );
    const missing = Object.keys(DEFINITION_DIAGNOSTIC_CODES)
      .filter((code) => !documented.has(code))
      .sort();
    expect(missing, "codes with no documentation entry").toEqual([]);
  });

  it("documents no code the catalog does not have", () => {
    const catalog = new Set(Object.keys(DEFINITION_DIAGNOSTIC_CODES));
    const stale = [...reference.matchAll(/^\| `(PH-[A-Z0-9-]+)` \|/gm)]
      .map((match) => match[1])
      .filter((code) => !catalog.has(code))
      .sort();
    expect(stale, "documented codes that no longer exist").toEqual([]);
  });

  it("states each code's real phase and severity", () => {
    const lines = reference.split("\n");
    for (const [code, meta] of Object.entries(DEFINITION_DIAGNOSTIC_CODES)) {
      const index = lines.findIndex((line) =>
        line.startsWith(`| \`${code}\` |`),
      );
      const row = lines[index];
      expect(row, code).toBeDefined();
      expect(row, code).toContain(`| ${meta.severity} |`);
      const section = lines
        .slice(0, index)
        .findLast((line) => line.startsWith("## "));
      if (section === "## Reserved codes") {
        expect(row, code).toContain(`| \`${meta.phase}\` |`);
      } else {
        expect(section, code).toBe(`## \`${meta.phase}\` phase`);
      }
    }
  });
});

describe("the code-first pages", () => {
  const pages = readdirSync(DOCS).filter((name) => name.endsWith(".md"));

  it("never call schema-first authoring legacy", () => {
    const offenders = pages.flatMap((name) =>
      page(name)
        .split("\n")
        .flatMap((line, index) =>
          /legacy/i.test(line) && !line.includes("legacy-graphql-default-v1")
            ? [`${name}:${index + 1}: ${line.trim()}`]
            : [],
        ),
    );
    expect(offenders).toEqual([]);
  });

  it("presents the two approaches as peers, in one table", () => {
    const choose = page("00-ChooseYourApproach.md");
    expect(choose).toContain("| | Schema-first | Code-first |");
    expect(choose).toContain("Both approaches produce a `DocumentModelModule`");
    expect(choose).toContain(
      "| Connect model editor | Edits the model definition | Shows the model definition read-only |",
    );
    expect(choose).toContain("Documents of that model stay editable.");
  });

  it("states the exit codes, including that 0 can mean skipped", () => {
    const tooling = page("03-Tooling.md");
    expect(tooling).toContain("| 0 | `skipped` |");
    expect(tooling).toContain("| 1 | `invalid` |");
    expect(tooling).toContain("| 2 | `failed` |");
    expect(tooling).toContain("Exit code `0` can mean `skipped`");
  });
});

describe("the samples the pages show", () => {
  const reference = page("02-TypesAndFields.md");
  const samples = readFileSync(join(HERE, "samples.ts"), "utf8");

  it("compile, and are the lines the page prints", () => {
    for (const line of [
      'const Priority = ph.enum("Priority", { values: ["LOW", "HIGH"] });',
      "id: ph.OID({ required: true }),",
      "priority: ph.ref(Priority),",
      "tags: ph.list(ph.String({ required: true })),",
    ]) {
      expect(reference, line).toContain(line);
      expect(samples, line).toContain(line);
    }
    for (const line of [
      "ph.String()                                  // String",
      "ph.String({ required: true })                // String!",
      "ph.list(ph.String({ required: true }))       // [String!]",
      "ph.list(ph.String(), { required: true })     // [String]!",
    ]) {
      const normalized = line.replace(/[ \t]+/g, " ");
      expect(reference.replace(/[ \t]+/g, " "), line).toContain(normalized);
      const sampleAnnotations = samples
        .replace(/,([ \t]+\/\/)/g, "$1")
        .replace(/[ \t]+/g, " ");
      expect(sampleAnnotations, line).toContain(normalized);
    }
  });

  it("accept null only where the reference marks a field or item optional", () => {
    expect(requiredRule.plain.validator.safeParse(null).success).toBe(true);
    expect(requiredRule.required.validator.safeParse(null).success).toBe(false);
    expect(requiredRule.listOfRequired.validator.safeParse(null).success).toBe(
      true,
    );
    expect(
      requiredRule.listOfRequired.validator.safeParse([null]).success,
    ).toBe(false);
    expect(requiredRule.requiredList.validator.safeParse(null).success).toBe(
      false,
    );
    expect(requiredRule.requiredList.validator.safeParse([null]).success).toBe(
      true,
    );
  });

  it("show the package scalar the page declares", () => {
    for (const line of [
      "export const HexColor = defineScalar({",
      'name: "HexColor",',
      'description: "A six-digit hexadecimal color, such as #1a2b3c.",',
      'representation: "string",',
      "validator: z.string().regex(/^#[0-9a-f]{6}$/i),",
      'zodSource: "z.string().regex(/^#[0-9a-f]{6}$/i)",',
      "fields: { color: HexColor({ required: true }) },",
    ]) {
      expect(reference, line).toContain(line);
      expect(samples, line).toContain(line);
    }
    expect(HexColor.definition.name).toBe("HexColor");
    expect(Label.fields.color.binding).toBe(HexColor.binding);
    expect(Label.fields.color.validator.safeParse("#1a2b3c").success).toBe(
      true,
    );
    expect(Label.fields.color.validator.safeParse("red").success).toBe(false);
  });

  it("declare what the page says they declare", () => {
    expect(Priority.kind).toBe("enum");
    expect(Item.kind).toBe("object");
    const specification = todoFamily.at(1).definition.specifications.at(-1)!;
    expect(specification.state.global.root.name).toBe("TodoState");
    const state = specification.types.find((type) => type.name === "TodoState");
    expect(state?.kind).toBe("object");
    const fields =
      state?.kind === "object"
        ? new Map(state.fields.map((field) => [field.name, field.type]))
        : new Map();
    expect(fields.get("title")).toMatchObject({
      kind: "scalar",
      name: "String",
      required: true,
    });
    expect(fields.get("items")).toMatchObject({
      kind: "list",
      required: true,
      item: { kind: "named", name: "Item", required: true },
    });
  });
});
