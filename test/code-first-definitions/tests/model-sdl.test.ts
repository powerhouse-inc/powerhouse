import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateModelSdl } from "../src/evidence/model-sdl.js";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = resolve(packageRoot, "fixtures/model-sdl/v1/manifest.json");

describe("B6 structured model SDL projection", () => {
  it("matches every AST, print, scalar, and no-regex assertion", async () => {
    const evaluation = await evaluateModelSdl(manifest);
    expect(evaluation.assertions).toEqual([
      expect.objectContaining({ id: "B6.parse", outcome: "pass" }),
      expect.objectContaining({ id: "B6.ast", outcome: "pass" }),
      expect.objectContaining({ id: "B6.print", outcome: "pass" }),
      expect.objectContaining({ id: "B6.scalar", outcome: "pass" }),
      expect.objectContaining({ id: "B6.no-regex", outcome: "pass" }),
    ]);
    expect(evaluation.cases).toHaveLength(4);
    expect(
      evaluation.cases.every(
        (fixture) =>
          fixture.firstDifference === null &&
          fixture.regexAdapterCallCount === 0,
      ),
    ).toBe(true);
  });

  it("covers the descriptor grammar, versions, and complete compatibility AST", async () => {
    const evaluation = await evaluateModelSdl(manifest);
    const variants = new Set(
      evaluation.cases.flatMap((fixture) => fixture.coveredVariants),
    );
    expect(variants).toEqual(
      new Set([
        "descriptor",
        "scalar-field",
        "named-field",
        "nested-list",
        "all-nullability",
        "enum",
        "object",
        "input",
        "interface",
        "union",
        "field-arguments",
        "deprecation",
        "operation",
        "error",
        "local-state",
        "unreachable-type",
        "compatibility-ast",
        "version-1",
        "version-2",
        "operations",
        "schema-definition",
        "directive-definition",
        "directive-use",
        "type-extension",
        "source-order",
      ]),
    );
  });

  it("repeats every content digest exactly", async () => {
    const [first, second] = await Promise.all([
      evaluateModelSdl(manifest),
      evaluateModelSdl(manifest),
    ]);
    const content = (
      evaluation: Awaited<ReturnType<typeof evaluateModelSdl>>,
    ) =>
      evaluation.cases.map(
        ({
          caseId,
          definitionDigest,
          sdlDigest,
          astDigest,
          scalarCatalogDigest,
          parserVersionDigest,
          regexAdapterCallCount,
          regexAdapterCallSites,
          coveredVariants,
          firstDifference,
        }) => ({
          caseId,
          definitionDigest,
          sdlDigest,
          astDigest,
          scalarCatalogDigest,
          parserVersionDigest,
          regexAdapterCallCount,
          regexAdapterCallSites,
          coveredVariants,
          firstDifference,
        }),
      );
    expect(content(second)).toEqual(content(first));
  });
});
