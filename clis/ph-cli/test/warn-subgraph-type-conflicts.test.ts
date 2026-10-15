import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type * as codegen from "@powerhousedao/vetra/codegen";
import { afterEach, describe, expect, it, vi } from "vitest";
import { warnSubgraphTypeConflicts } from "../src/utils/warn-subgraph-type-conflicts.js";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..", "..");

const temporary: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A package with a schema-first subgraph `alpha` and a code-first subgraph
 * `beta` in `subgraphs/beta.ts`, which `powerhouse.config.json` selects. Both
 * define Query.widget.
 */
function makeMixedProject(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ph-warn-subgraphs-")));
  temporary.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "mixed", private: true, type: "module" }),
  );
  writeFileSync(
    join(root, "powerhouse.config.json"),
    JSON.stringify({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./subgraphs/beta.ts" }],
      },
    }),
  );
  mkdirSync(join(root, "subgraphs", "alpha"), { recursive: true });
  writeFileSync(
    join(root, "subgraphs", "alpha", "schema.ts"),
    'import { gql } from "graphql-tag";\n\nexport const schema = gql`\ntype Query { widget: String }\n`;\n',
  );
  writeFileSync(
    join(root, "subgraphs", "beta.ts"),
    [
      'import { defineSubgraph } from "@powerhousedao/reactor-api";',
      'import { ph } from "document-model";',
      "",
      "export const BetaSubgraph = defineSubgraph({",
      '  name: "beta",',
      '  schemaKind: "typed",',
      "  entries: ({ query }) => [",
      '    query("widget", { returns: ph.String(), resolve: () => null }),',
      "  ],",
      "});",
      "",
    ].join("\n"),
  );
  const modules = join(root, "node_modules");
  mkdirSync(join(modules, "@powerhousedao"), { recursive: true });
  for (const [target, link] of [
    ["document-model", "document-model"],
    ["shared", "@powerhousedao/shared"],
    ["reactor-api", "@powerhousedao/reactor-api"],
  ]) {
    symlinkSync(join(REPOSITORY_ROOT, "packages", target), join(modules, link));
  }
  return root;
}

async function printed(
  projectDir: string,
  warn = warnSubgraphTypeConflicts,
): Promise<string[]> {
  const lines: string[] = [];
  vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
    lines.push(parts.map(String).join(" "));
  });
  await warn(projectDir);
  return lines;
}

function addGamma(root: string) {
  mkdirSync(join(root, "subgraphs", "gamma"));
  writeFileSync(
    join(root, "subgraphs", "gamma", "schema.ts"),
    'import { gql } from "graphql-tag";\n\nexport const schema = gql`\ntype Query { widget: String }\n`;\n',
  );
}

const GAMMA_CONFLICT =
  '⚠ Subgraphs "alpha" and "gamma" both define Query.widget, and the supergraph can include only one of them. Define Query.widget in one subgraph only.';

const CONFLICT =
  '⚠ Subgraphs "alpha" and "beta" both define Query.widget, and the supergraph can include only one of them. Define Query.widget in one subgraph only.';

describe("warnSubgraphTypeConflicts", () => {
  it("warns on a root field a schema-first and a selected code-first subgraph both define", async () => {
    expect(await printed(makeMixedProject())).toEqual([CONFLICT]);
  }, 60_000);

  it("names a code-first source that fails to import, and checks the rest", async () => {
    const root = makeMixedProject();
    writeFileSync(
      join(root, "powerhouse.config.json"),
      JSON.stringify({
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [
            { specifier: "./subgraphs/beta.ts" },
            { specifier: "./subgraphs/broken.ts" },
          ],
        },
      }),
    );
    writeFileSync(
      join(root, "subgraphs", "broken.ts"),
      "export const Broken = defineSubgraph({\n",
    );

    expect(await printed(root)).toEqual([
      '⚠ Could not load the code-first definitions in ./subgraphs/broken.ts, so subgraph conflicts with them are not checked. Run "ph model check" to see why.',
      CONFLICT,
    ]);
  }, 60_000);

  it("names a selected export that fails to load from a module whose other export loads", async () => {
    const root = makeMixedProject();
    writeFileSync(
      join(root, "powerhouse.config.json"),
      JSON.stringify({
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [
            { specifier: "./subgraphs/beta.ts", exportPath: ["BetaSubgraph"] },
            { specifier: "./subgraphs/beta.ts", exportPath: ["GammaSubgraph"] },
          ],
        },
      }),
    );

    expect(await printed(root)).toEqual([
      '⚠ Could not load the code-first definitions in ./subgraphs/beta.ts#/GammaSubgraph, so subgraph conflicts with them are not checked. Run "ph model check" to see why.',
      CONFLICT,
    ]);
  }, 60_000);

  it("still checks schema-first subgraphs when the code-first definitions cannot be loaded", async () => {
    const root = makeMixedProject();
    addGamma(root);
    symlinkSync("loop", join(root, "loop"));

    expect(await printed(root)).toEqual([
      '⚠ Could not load the code-first definitions, so subgraph conflicts with them are not checked: Directory symlink cycle at "loop"; package inputs cannot be read.',
      GAMMA_CONFLICT,
    ]);
  }, 60_000);

  it("still checks schema-first subgraphs when checking the code-first ones throws", async () => {
    vi.resetModules();
    vi.doMock("@powerhousedao/vetra/codegen", async (importOriginal) => {
      const actual = await importOriginal<typeof codegen>();
      return {
        ...actual,
        lintSubgraphTypes: (projectDir: string, codeFirst?: unknown) => {
          if (codeFirst !== undefined) {
            throw new Error("A code-first definition is malformed.");
          }
          return actual.lintSubgraphTypes(projectDir);
        },
      };
    });
    const { warnSubgraphTypeConflicts: warn } =
      await import("../src/utils/warn-subgraph-type-conflicts.js");
    vi.doUnmock("@powerhousedao/vetra/codegen");
    const root = makeMixedProject();
    addGamma(root);

    expect(await printed(root, warn)).toEqual([
      "⚠ Could not check the code-first definitions, so subgraph conflicts with them are not checked: A code-first definition is malformed.",
      GAMMA_CONFLICT,
    ]);
  }, 60_000);

  it("reports one failure when a project without code-first definitions cannot be checked", async () => {
    vi.resetModules();
    vi.doMock("@powerhousedao/vetra/codegen", async (importOriginal) => ({
      ...(await importOriginal<typeof codegen>()),
      lintSubgraphTypes: () => {
        console.warn("document-models/broken/broken.json is not JSON.");
        throw new Error("A model file is not JSON.");
      },
    }));
    const { warnSubgraphTypeConflicts: warn } =
      await import("../src/utils/warn-subgraph-type-conflicts.js");
    vi.doUnmock("@powerhousedao/vetra/codegen");
    const root = makeMixedProject();
    rmSync(join(root, "powerhouse.config.json"));

    expect(await printed(root, warn)).toEqual([
      "document-models/broken/broken.json is not JSON.",
      "⚠ Failed to check subgraph type names: Error: A model file is not JSON.",
    ]);
  }, 60_000);
});
