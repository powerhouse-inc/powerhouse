import {
  generateDocumentModel,
  loadDocumentModel,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createModelProject, storedModel } from "./model-project.js";
import { gqlModule, installSubgraphDependencies } from "./subgraph-project.js";

const cli = join(import.meta.dirname, "..", "dist", "cli.mjs");

it("migrates a model and subgraph through the built Node CLI", async () => {
  const project = createModelProject("empty", {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        strict: true,
        skipLibCheck: true,
        paths: { "document-models/*": ["./document-models/*/index.ts"] },
      },
    }),
    "notes.json": storedModel("acme/notes", "Notes", { modules: [] }),
    "subgraphs/hello/schema.ts": gqlModule("type Query { hello: String! }"),
    "subgraphs/hello/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";
export class HelloSubgraph extends BaseSubgraph {
  name = "hello";
  typeDefs = schema;
  resolvers = { Query: { hello: () => "hello" } };
}
`,
  });
  try {
    installSubgraphDependencies(project.root);
    const tsProject = buildTsMorphProject(project.root);
    await generateDocumentModel(
      await loadDocumentModel(join(project.root, "notes.json")),
      tsProject,
    );
    await tsProject.save();
    // This consumer has no React dependency.
    const version = join(project.root, "document-models/notes/v1");
    rmSync(join(version, "hooks.ts"));
    const barrel = join(version, "index.ts");
    writeFileSync(
      barrel,
      readFileSync(barrel, "utf8").replace('export * from "./hooks.js";\n', ""),
    );

    const run = (args: readonly string[]) =>
      spawnSync(process.execPath, [cli, ...args], {
        cwd: project.root,
        env: { ...process.env, CI: "1", PH_NO_TELEMETRY: "1" },
        encoding: "utf8",
        timeout: 120_000,
      });
    const migrated = run(["migrate", "--document-models", "--subgraphs"]);
    expect(migrated.status, migrated.stdout + migrated.stderr).toBe(0);
    expect(migrated.stdout).toContain("document-models/notes: converted");
    expect(migrated.stdout).toContain("subgraphs/hello: converted");
    const checked = run(["model", "check"]);
    expect(checked.status, checked.stdout + checked.stderr).toBe(0);
  } finally {
    project.dispose();
  }
}, 240_000);
