// @vitest-environment node
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { DEFAULT_CONFIG } from "@powerhousedao/config";
import {
  DocumentModelGlobalStateSchema,
  parseBulkArchive,
} from "@powerhousedao/shared/document-model";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import { utils as subgraphUtils } from "../../../document-models/subgraph-module/index.js";
import { DocumentModelGenerator } from "../document-handlers/generators/document-model-generator.js";
import { SubgraphGenerator } from "../document-handlers/generators/subgraph-generator.js";
import { logger } from "../logger.js";

const temporary: string[] = [];
const packagesDir = resolve(import.meta.dirname, "../../../..");

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporary.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function makeProject(subgraph: string): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "vetra-generator-backup-")),
  );
  temporary.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "@acme/backup",
      type: "module",
      peerDependencies: {
        "@powerhousedao/reactor-api": "6.2.3",
        "document-model": "6.2.3",
      },
    }),
  );
  writeFileSync(join(root, "tsconfig.json"), "{}");
  for (const [name, target] of Object.entries({
    "@powerhousedao/reactor-api": join(packagesDir, "reactor-api"),
    "@powerhousedao/shared": join(packagesDir, "shared"),
    "document-model": join(packagesDir, "document-model"),
    graphql: join(packagesDir, "reactor-api/node_modules/graphql"),
    "graphql-tag": join(packagesDir, "reactor-api/node_modules/graphql-tag"),
  })) {
    const link = join(root, "node_modules", name);
    mkdirSync(join(link, ".."), { recursive: true });
    symlinkSync(realpathSync(target), link, "junction");
  }
  const modelDir = join(root, "document-models/subgraph-module");
  mkdirSync(modelDir, { recursive: true });
  copyFileSync(
    join(
      packagesDir,
      "vetra/document-models/subgraph-module/subgraph-module.json",
    ),
    join(modelDir, "subgraph-module.json"),
  );
  mkdirSync(join(root, "subgraphs"));
  writeFileSync(join(root, "subgraphs/index.ts"), subgraph);
  return root;
}

async function readBackup(root: string, name: string) {
  const entries = await parseBulkArchive(
    new Uint8Array(readFileSync(join(root, "backup-documents", name))),
  );
  return Object.fromEntries(
    entries.map(({ path, data }) => [
      path,
      JSON.parse(new TextDecoder().decode(data)) as unknown,
    ]),
  );
}

const oldDiagnostic =
  'PH-SG-DEFINITION-INVALID [error/definition] ./subgraphs/index.ts#/Old /Old: Old has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`. Expected: a class with its own static subgraphName and getSchema Received: Old Repair: Declare static override readonly subgraphName = "my-subgraph" and static override getSchema(schema) on Old. Run ph migrate to convert an old-style subgraph that sets name, typeDefs, resolvers, hasSubscriptions or path.';

it.each<{ sibling: string; source: string; reported: unknown }>([
  {
    sibling: "old-style",
    source:
      'import { BaseSubgraph } from "@powerhousedao/reactor-api"; export class Old extends BaseSubgraph { name = "old"; }',
    reported: `❌ Subgraph validation failed: ${oldDiagnostic}`,
  },
  {
    sibling: "syntax-error",
    source: "export {",
    // oxc prints the file relative to the working directory, and sizes its code frame to that path.
    reported: expect.stringMatching(
      /^❌ Subgraph validation failed: PH-IMPORT-FAILED \[error\/import\] \.\/subgraphs\/index\.ts \(root\): This definition source could not be imported\. Expected: an importable TypeScript module Received: Error: Transform failed with 1 error: \[PARSE_ERROR\] Expected `\}` but found `EOF` ╭─\[ (?:\S+\/)?subgraphs\/index\.ts:1:9 \] │ 1 │ export \{ .* Repair: Fix this module or one of its imports, then run the definition check again\.$/,
    ),
  },
])(
  "backs up a generated model and reports its $sibling sibling as a subgraph error",
  async ({ source, reported }) => {
    const root = makeProject(source);
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const global = DocumentModelGlobalStateSchema().parse(
      JSON.parse(
        readFileSync(
          join(root, "document-models/subgraph-module/subgraph-module.json"),
          "utf8",
        ),
      ),
    );
    const generator = new DocumentModelGenerator(
      { PH_CONFIG: DEFAULT_CONFIG, CURRENT_WORKING_DIR: root },
      buildTsMorphProject(root),
    );
    await expect(
      generator.generate({
        documentId: "model-doc",
        documentType: "powerhouse/document-model",
        branch: "main",
        scope: "global",
        state: { global },
      }),
    ).resolves.toBeUndefined();

    const backup = await readBackup(root, "Subgraph Module.subgraph.phd");
    expect(
      readFileSync(
        join(root, "document-models/subgraph-module/v1/gen/types.ts"),
        "utf8",
      ),
    ).toContain("type SubgraphModulePHState = PHBaseState & {");
    expect(backup["state.json"]).toEqual({ global });
    expect(backup["current-state.json"]).toEqual({ global });
    expect(backup["operations.json"]).toEqual({});
    expect(backup["header.json"]).toMatchObject({
      id: "model-doc",
      documentType: "powerhouse/document-model",
      branch: "main",
      name: "Subgraph Module",
    });
    expect(info.mock.calls).toContainEqual([
      "✅ Code generation completed successfully for: Subgraph Module",
    ]);
    expect(
      error.mock.calls.map(([message]) =>
        stripVTControlCharacters(String(message)),
      ),
    ).toEqual([reported]);
  },
  60_000,
);

it("backs up a generated subgraph before reporting its exact host conflict", async () => {
  const root = makeProject("");
  const backupsAtWarning: boolean[] = [];
  const warn = vi.spyOn(logger, "warn").mockImplementation(() => {
    backupsAtWarning.push(
      existsSync(join(root, "backup-documents/system.phd")),
    );
  });
  const state = subgraphUtils.createDocument().state;
  state.global.name = "system";
  state.global.status = "CONFIRMED";
  const generator = new SubgraphGenerator(
    { PH_CONFIG: DEFAULT_CONFIG, CURRENT_WORKING_DIR: root },
    buildTsMorphProject(root),
  );
  await generator.generate({
    documentId: "subgraph-doc",
    documentType: "powerhouse/subgraph",
    branch: "main",
    scope: "global",
    state,
  });
  const backup = await readBackup(root, "system.phd");
  expect(backup["state.json"]).toEqual(state);
  expect(backup["header.json"]).toMatchObject({
    id: "subgraph-doc",
    documentType: "powerhouse/subgraph",
    branch: "main",
    name: "system",
  });
  expect(warn.mock.calls).toEqual([
    [
      '⚠️ Subgraph "system" has the name of a core subgraph, so the server refuses it. Rename the subgraph.',
    ],
  ]);
  expect(backupsAtWarning).toEqual([true]);
}, 60_000);
