import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { oxlintConfigTemplate } from "templates";
import { afterEach, describe, expect, it } from "vitest";
import { buildTsMorphProject } from "../utils/ts-morph-project.js";
import { generateProcessor } from "./generate.js";

const originalCwd = process.cwd();
const temporary: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function makeProject() {
  const root = mkdtempSync(join(tmpdir(), "ph-generate-processors-"));
  temporary.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "@acme/stockroom", type: "module" }, null, 2),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  writeFileSync(join(root, ".oxlintrc.json"), oxlintConfigTemplate);
  const project = buildTsMorphProject(root);
  for (const processorType of ["analytics", "relationalDb"] as const) {
    await generateProcessor(
      {
        processorName: `Stock ${processorType}`,
        processorType,
        processorApps: ["switchboard", "connect"],
        documentTypes: ["acme/stock-item"],
      },
      project,
    );
  }
  await project.save();
  return root;
}

type Diagnostic = { code: string; filename: string; message: string };

// The project's own oxlint config, as `npm run lint` reads it.
function lint(root: string): Diagnostic[] {
  const require = createRequire(import.meta.url);
  const bin = join(require.resolve("oxlint/package.json"), "../bin/oxlint");
  const result = spawnSync(
    process.execPath,
    [bin, "--format", "json", "processors"],
    { cwd: root, encoding: "utf8" },
  );
  return (JSON.parse(result.stdout) as { diagnostics: Diagnostic[] })
    .diagnostics;
}

describe("generated processors", () => {
  it("lint without unused variables", async () => {
    const root = await makeProject();

    const unused = lint(root).filter((d) => d.code.includes("no-unused-vars"));

    expect(unused).toEqual([]);
  });

  it("give a relational processor a starter test that lints clean", async () => {
    const root = await makeProject();

    expect(
      existsSync(
        join(root, "processors/stock-relational-db/processor.test.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(join(root, "processors/stock-analytics/processor.test.ts")),
    ).toBe(false);
    const diagnostics = lint(root).filter((d) =>
      d.filename.endsWith("processor.test.ts"),
    );
    expect(diagnostics).toEqual([]);
  });

  it("leave an existing processor without a starter test", async () => {
    const root = await makeProject();
    const testFile = join(
      root,
      "processors/stock-relational-db/processor.test.ts",
    );
    rmSync(testFile);

    const project = buildTsMorphProject(root);
    await generateProcessor(
      {
        processorName: "Stock relationalDb",
        processorType: "relationalDb",
        processorApps: ["switchboard", "connect"],
        documentTypes: ["acme/stock-item"],
      },
      project,
    );
    await project.save();

    expect(existsSync(testFile)).toBe(false);
  });
});
