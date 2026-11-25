import { runSafely } from "cmd-ts";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { subgraphDiagnostics } from "../../../packages/document-model/src/definition/subgraph/diagnostic-codes.js";
import { checkDiagnostics } from "../../../packages/document-model/src/definition/tooling/check/diagnostic-codes.js";
import { inspectDiagnostics } from "../../../packages/document-model/src/definition/tooling/inspect/diagnostic-codes.js";
import { releaseDiagnostics } from "../../../packages/document-model/src/definition/tooling/release/diagnostic-codes.js";
import { subgraphToolingDiagnostics } from "../../../packages/document-model/src/definition/tooling/subgraph/diagnostic-codes.js";
import { generate } from "../src/commands/generate.js";
import { model } from "../src/commands/model.js";

/**
 * Values a program reads, which keep the two words: diagnostic codes, a check
 * name, wire values, and the `style`, `kind` and `layout` values as JSON
 * prints them.
 */
const IDENTIFIER_VALUES = [
  "PH-SG-SCHEMA-FIRST-CONFLICT",
  "PH-SG-SCHEMA-FIRST-UNCHECKED",
  "subgraph-schema-first-sdl",
  "explicit-schema-first",
  "schema-first-id:",
  '"schema-first"',
  '"code-first"',
];

const STYLE_WORD = /(schema|code)[- ]first/i;

/** The lines of `text` that name an authoring style outside an identifier value. */
function styleWordLines(text: string): string[] {
  return text
    .split("\n")
    .filter((line) =>
      STYLE_WORD.test(
        IDENTIFIER_VALUES.reduce(
          (rest, value) => rest.replaceAll(value, ""),
          line,
        ),
      ),
    );
}

type Group = typeof generate | typeof model;

async function helpOf(group: Group, argv: string[]): Promise<string> {
  const result = await runSafely(group, [...argv, "--help"]);
  if (result._tag !== "error") throw new Error("--help printed no help");
  return stripVTControlCharacters(result.error.config.message);
}

/** The help of a command group and of each subcommand its help lists. */
async function helpTexts(group: Group): Promise<Record<string, string>> {
  const own = await helpOf(group, []);
  const subcommands = [...own.matchAll(/^- (\S+)/gm)].map(([, name]) => name);
  const texts: Record<string, string> = { [group.name]: own };
  for (const name of subcommands) {
    texts[`${group.name} ${name}`] = await helpOf(group, [name]);
  }
  return texts;
}

describe("the words for the two authoring forms", () => {
  it("tells a style word in prose from one inside an identifier value", () => {
    expect(
      styleWordLines(
        [
          "PH-SG-SCHEMA-FIRST-CONFLICT [warning/composition]",
          'style: "schema-first", serialization explicit-schema-first',
          "a schema-first subgraph",
          "Code-first models declare: none.",
          "a legacy subgraph and a `Subgraph` class",
        ].join("\n"),
      ),
    ).toStrictEqual([
      "a schema-first subgraph",
      "Code-first models declare: none.",
    ]);
  });

  it("are absent from the help of ph generate and ph model", async () => {
    const texts = {
      ...(await helpTexts(generate)),
      ...(await helpTexts(model)),
    };
    expect(Object.keys(texts)).toEqual(
      expect.arrayContaining([
        "generate",
        "generate document-model",
        "generate subgraph",
        "model",
        "model check",
        "model inspect",
      ]),
    );
    expect(
      Object.entries(texts).flatMap(([command, text]) =>
        styleWordLines(text).map((line) => `ph ${command}: ${line}`),
      ),
    ).toStrictEqual([]);
  });

  it("are absent from the diagnostic catalog, outside the codes", () => {
    const catalogs = [
      checkDiagnostics,
      inspectDiagnostics,
      releaseDiagnostics,
      subgraphToolingDiagnostics,
      subgraphDiagnostics,
    ];
    const entries = new Map(
      catalogs.flatMap(({ codes }) =>
        Object.entries(codes).map(
          ([code, { meaning }]) => [code, `${code}: ${meaning}`] as const,
        ),
      ),
    );
    expect(entries.has("PH-SG-SCHEMA-FIRST-CONFLICT")).toBe(true);
    expect(styleWordLines([...entries.values()].join("\n"))).toStrictEqual([]);
  });
});
