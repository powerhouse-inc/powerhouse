import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NamedGraphQLTypeDefinition } from "@powerhousedao/shared/document-model";
import {
  buildSchema,
  type EnumTypeDefinitionNode,
  type FieldDefinitionNode,
  Kind,
  type ObjectTypeDefinitionNode,
  parse,
  print,
} from "graphql";
import { describe, expect, it } from "vitest";
import {
  EMPTY_INPUT_FIELD_NAME,
  printNamedDefinition,
  printSchemaSegment,
  printTypeReference,
} from "../../src/definition/printer.js";
import {
  ESCAPED_DESCRIPTION,
  FIXTURE_SCALAR_PRELUDE,
  MULTILINE_DESCRIPTION,
  PRINTER_FIXTURE,
} from "./fixtures/printer-wire.js";

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = resolve(here, "goldens/printer.graphql");
const segment = printSchemaSegment(PRINTER_FIXTURE);

function definitionByName(name: string): NamedGraphQLTypeDefinition {
  const definition = PRINTER_FIXTURE.find(
    (candidate) => candidate.name === name,
  );
  if (definition === undefined) throw new Error(`no fixture named ${name}`);
  return definition;
}

/** `graphql.print` returns no trailing newline; our segments always carry one. */
function normalizePrint(document: string): string {
  return `${print(parse(document)).trimEnd()}\n`;
}

describe("the deterministic SDL printer", () => {
  it("matches the committed golden bytes", () => {
    expect(segment).toBe(readFileSync(goldenPath, "utf8"));
  });

  it("uses LF, two-space indentation, and exactly one trailing newline", () => {
    expect(segment.includes("\r")).toBe(false);
    expect(segment.endsWith("\n")).toBe(true);
    expect(segment.endsWith("\n\n")).toBe(false);
    const indented = segment.split("\n").filter((line) => line.startsWith(" "));
    expect(indented.length).toBeGreaterThan(0);
    for (const line of indented) {
      expect(line.startsWith("  ")).toBe(true);
      expect(line.startsWith("   ")).toBe(false);
    }
  });

  it("parses with the installed graphql version and reprints stably", () => {
    const source = `${FIXTURE_SCALAR_PRELUDE}\n\n${segment}`;
    const once = normalizePrint(source);
    expect(normalizePrint(once)).toBe(once);
    // Every fixture definition survives the round trip.
    const printedNames = parse(once)
      .definitions.map((definition) =>
        "name" in definition && definition.name !== undefined
          ? definition.name.value
          : "",
      )
      .filter((name) => name.length > 0);
    for (const definition of PRINTER_FIXTURE) {
      expect(printedNames).toContain(definition.name);
    }
  });

  it("assembles into a valid schema, including an explicit empty input", () => {
    const schema = buildSchema(
      [
        FIXTURE_SCALAR_PRELUDE,
        segment,
        "type Query { task(filter: TaskFilterInput, clear: ClearInput): Task }",
      ].join("\n\n"),
    );
    const empty = schema.getType("ClearInput");
    expect(empty).toBeDefined();
    expect(printNamedDefinition(definitionByName("ClearInput"))).toBe(
      `input ClearInput {\n  ${EMPTY_INPUT_FIELD_NAME}: Boolean\n}`,
    );
    // The placeholder is nullable, so the generated optional-argument creator
    // contract holds for an explicit empty input.
    const field = schema.getQueryType()?.getFields().task;
    expect(field?.args.map((argument) => argument.name)).toStrictEqual([
      "filter",
      "clear",
    ]);
  });

  it("prints enum, nested input-object, list, and null defaults from the type", () => {
    const printed = printNamedDefinition(
      definitionByName("TaskFilterInput"),
      new Map(PRINTER_FIXTURE.map((entry) => [entry.name, entry])),
    );
    expect(printed).toContain("priority: Priority = HIGH");
    expect(printed).toContain(
      "page: PagingInput = {size: 10, cursor: null, order: LOW}",
    );
    expect(printed).toContain('titles: [String!] = ["a", "b"]');
    expect(printed).toContain("note: String = null");
    expect(printed).toContain(
      "metadata: JSONObject = {nested: {count: 1}, flag: true}",
    );
    // An enum token is not a string literal, and the parsed AST agrees.
    const parsed = parse(`${printed}`).definitions[0];
    if (parsed.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION) {
      throw new Error("expected an input object definition");
    }
    const priority = parsed.fields?.find(
      (field) => field.name.value === "priority",
    );
    expect(priority?.defaultValue?.kind).toBe(Kind.ENUM);
  });

  it("keeps description values exact through a parse", () => {
    const document = parse(`${FIXTURE_SCALAR_PRELUDE}\n\n${segment}`);
    const priority = document.definitions.find(
      (definition): definition is EnumTypeDefinitionNode =>
        definition.kind === Kind.ENUM_TYPE_DEFINITION &&
        definition.name.value === "Priority",
    );
    expect(priority?.description?.value).toBe(MULTILINE_DESCRIPTION);
    expect(priority?.description?.block).toBe(true);
    const task = document.definitions.find(
      (definition): definition is ObjectTypeDefinitionNode =>
        definition.kind === Kind.OBJECT_TYPE_DEFINITION &&
        definition.name.value === "Task",
    );
    expect(task?.description?.value).toBe(ESCAPED_DESCRIPTION);
    expect(task?.description?.block).toBe(false);
  });

  it("keeps argument metadata and directive uses", () => {
    const document = parse(`${FIXTURE_SCALAR_PRELUDE}\n\n${segment}`);
    const task = document.definitions.find(
      (definition): definition is ObjectTypeDefinitionNode =>
        definition.kind === Kind.OBJECT_TYPE_DEFINITION &&
        definition.name.value === "Task",
    );
    const fields = new Map<string, FieldDefinitionNode>(
      (task?.fields ?? []).map((field) => [field.name.value, field]),
    );
    const assignee = fields.get("assignee");
    expect(
      assignee?.arguments?.map((argument) => argument.name.value),
    ).toStrictEqual(["at", "fallbackPriority"]);
    expect(assignee?.arguments?.[0]?.description?.value).toBe(
      "As of this moment.",
    );
    expect(assignee?.arguments?.[1]?.defaultValue?.kind).toBe(Kind.ENUM);
    const audited = fields.get("audited");
    expect(
      audited?.directives?.map((directive) => directive.name.value),
    ).toStrictEqual(["audit", "internal"]);
    const note = fields.get("note");
    expect(note?.directives?.[0]?.name.value).toBe("deprecated");
  });

  it("prints type references for every nullability combination", () => {
    expect(
      printTypeReference({ kind: "scalar", name: "String", required: false }),
    ).toBe("String");
    expect(
      printTypeReference({
        kind: "list",
        required: true,
        item: {
          kind: "list",
          required: false,
          item: { kind: "named", name: "Task", required: true },
        },
      }),
    ).toBe("[[Task!]]!");
  });

  it("prints nothing for an empty definition list", () => {
    expect(printSchemaSegment([])).toBe("");
  });

  it("is byte-identical when printed twice in one process", () => {
    expect(printSchemaSegment(PRINTER_FIXTURE)).toBe(segment);
    expect(printSchemaSegment([...PRINTER_FIXTURE])).toBe(segment);
  });

  it("is byte-identical in a fresh process", () => {
    const script = resolve(tmpdir(), "cf-printer-fresh-process.ts");
    const printer = resolve(here, "../../src/definition/printer.js");
    const fixture = resolve(here, "fixtures/printer-wire.js");
    writeFileSync(
      script,
      [
        `import { printSchemaSegment } from ${JSON.stringify(printer)};`,
        `import { PRINTER_FIXTURE } from ${JSON.stringify(fixture)};`,
        "process.stdout.write(printSchemaSegment(PRINTER_FIXTURE));",
      ].join("\n"),
    );
    const printed = execFileSync("pnpm", ["exec", "tsx", script], {
      cwd: resolve(here, "../.."),
      encoding: "utf8",
    });
    expect(printed).toBe(segment);
  }, 60_000);

  it("reaches no graphql module from its runtime import graph", () => {
    const root = resolve(here, "../../src/definition/printer.ts");
    const seen = new Set<string>();
    const bare = new Set<string>();
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) {
          bare.add(specifier);
          continue;
        }
        visit(resolve(dirname(file), specifier.replace(/\.js$/, ".ts")));
      }
    };
    visit(root);
    expect(
      [...bare].some((specifier) => /^graphql(\/|$)/.test(specifier)),
    ).toBe(false);
    expect(seen.size).toBeGreaterThan(0);
  });
});
