// Every module kind, scaffolded into one project, against the project's own
// formatter and linter config, as `npm run format:check` and `lint` read them.
import {
  generateAll,
  generateApp,
  generateEditor,
  generatePiece,
  generatePieceAction,
  generatePieceTrigger,
  generateProcessor,
  generateSubgraph,
} from "@powerhousedao/codegen";
import { writeAllGeneratedProjectFiles } from "@powerhousedao/codegen/file-builders";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import {
  TEST_OUTPUT,
  WITH_DOCUMENT_MODELS_SPEC_2,
  WORKSPACE_DIR,
} from "../constants.js";
import { cpForce, rmForce } from "../utils.js";

const projectDir = join(TEST_OUTPUT, "generated-output");
const workspaceRequire = createRequire(join(WORKSPACE_DIR!, "package.json"));

function bin(pkg: string, path: string) {
  return join(workspaceRequire.resolve(`${pkg}/package.json`), "..", path);
}

function run(pkg: string, path: string, args: string[]) {
  return spawnSync(process.execPath, [bin(pkg, path), ...args], {
    cwd: projectDir,
    encoding: "utf8",
  });
}

function readTree(dir: string, files = new Map<string, string>()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) readTree(path, files);
    else {
      const key = relative(projectDir, path).replaceAll("\\", "/");
      files.set(key, readFileSync(path, "utf8"));
    }
  }
  return files;
}

async function regenerateAll() {
  const project = buildTsMorphProject(projectDir);
  await generateAll(project);
  await project.save();
}

beforeAll(async () => {
  await rmForce(projectDir);
  // Its own repo, so the monorepo's .gitignore does not hide it from oxfmt.
  await cpForce(WITH_DOCUMENT_MODELS_SPEC_2, projectDir);
  process.chdir(projectDir);

  const project = buildTsMorphProject(projectDir);
  await generateEditor(
    { editorName: "Test Doc Editor", documentTypes: ["powerhouse/test-doc"] },
    project,
  );
  await generateApp(
    { appName: "Stock App", allowedDocumentTypes: ["powerhouse/test-doc"] },
    project,
  );
  await generateSubgraph("stock-totals", project);
  for (const processorType of ["analytics", "relationalDb"] as const) {
    await generateProcessor(
      {
        processorName: `stock ${processorType}`,
        processorType,
        processorApps: ["switchboard", "connect"],
        documentTypes: ["powerhouse/test-doc"],
      },
      project,
    );
  }
  await project.save();

  // Pieces read the project from disk, as `ph generate piece` does.
  const pieceProject = buildTsMorphProject(projectDir);
  await generatePiece({ pieceName: "Acme Widgets" }, pieceProject);
  await pieceProject.save();
  const partsProject = buildTsMorphProject(projectDir);
  await generatePieceAction({ actionName: "create widget" }, partsProject);
  await generatePieceTrigger({ triggerName: "widget created" }, partsProject);
  await partsProject.save();

  // What `ph migrate` rewrites, without the oxfmt run `ph init` adds.
  await writeAllGeneratedProjectFiles(projectDir);
});

describe("generated output", () => {
  it("passes the project's oxfmt --check", () => {
    const result = run("oxfmt", "bin/oxfmt", ["--check", "."]);
    expect(result.stdout + result.stderr).toContain(
      "All matched files use the correct format",
    );
    expect(result.status).toBe(0);
  });

  it("lints the drive app and the editor clean with the project's type-aware oxlint", () => {
    const result = run("oxlint", "bin/oxlint", [
      "--type-aware",
      "--format",
      "json",
      "editors",
    ]);
    const { diagnostics } = JSON.parse(result.stdout) as {
      diagnostics: { code: string; filename: string; message: string }[];
    };
    expect(
      diagnostics.map((d) => `${d.filename}: ${d.code} ${d.message}`),
    ).toEqual([]);
  });

  it("leaves the files codegen writes over out of the project's lint", () => {
    const owned = [...readTree(projectDir)]
      .filter(
        ([path, contents]) =>
          path.includes("/gen/") || contents.includes("WARNING: DO NOT EDIT"),
      )
      .map(([path]) => path)
      .filter((path) => /\.tsx?$/.test(path))
      // An upgrade transition is written once, for the project to edit; the
      // processor aggregates are left to their own templates.
      .filter((path) => !/upgrades\/v\d+\.ts$/.test(path))
      .filter((path) => !path.startsWith("processors/"));
    expect(owned).toContain("document-models/test-doc/v1/gen/reducer.ts");
    expect(owned).toContain("editors/editors.ts");
    const result = run("oxlint", "bin/oxlint", owned);
    expect(result.stdout + result.stderr).toContain("No files found to lint");
  });

  it("keeps the do-not-edit header of every aggregate codegen rewrites", () => {
    for (const path of [
      "document-models/document-models.ts",
      "document-models/index.ts",
      "document-models/upgrade-manifests.ts",
      "editors/editors.ts",
      "editors/index.ts",
      "subgraphs/index.ts",
    ]) {
      expect({
        path,
        header: readFileSync(join(projectDir, path), "utf8").includes(
          "WARNING: DO NOT EDIT",
        ),
      }).toEqual({ path, header: true });
    }
  });

  it("is unchanged by generating everything again, twice", async () => {
    const scaffolded = readTree(projectDir);
    for (let run = 0; run < 2; run++) {
      await regenerateAll();
      const regenerated = readTree(projectDir);
      expect([...regenerated.keys()].sort()).toEqual(
        [...scaffolded.keys()].sort(),
      );
      for (const [path, contents] of scaffolded) {
        expect({ path, contents: regenerated.get(path) }).toEqual({
          path,
          contents,
        });
      }
    }
  });
});
