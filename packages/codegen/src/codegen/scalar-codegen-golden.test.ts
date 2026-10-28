import type {
  DocumentModelGlobalState,
  DocumentSpecification,
} from "document-model";
import { documentModelScalars } from "document-model/scalars";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDocumentModel } from "./generate.js";
import { buildTsMorphProject } from "../utils/ts-morph-project.js";

const scalarNames = documentModelScalars.map(({ name }) => name);

function specification(schema: string): DocumentSpecification {
  return {
    version: 1,
    changeLog: [],
    state: {
      global: { schema, initialValue: "{}", examples: [] },
      local: { schema: "", initialValue: "{}", examples: [] },
    },
    modules: [],
  };
}

describe("scalar generated files", () => {
  const originalCwd = process.cwd();
  const workDir = mkdtempSync(join(tmpdir(), "scalar-codegen-"));
  const versionDir = join(workDir, "document-models", "scalar-fixture", "v1");

  beforeAll(async () => {
    mkdirSync(workDir, { recursive: true });
    writeFileSync(
      join(workDir, "package.json"),
      JSON.stringify({ name: "scalar-fixture", type: "module" }),
    );
    writeFileSync(
      join(workDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          paths: { "document-models/*": ["./document-models/*/index.ts"] },
        },
      }),
    );
    const spec = specification(
      `type ScalarFixtureState {\n${scalarNames.map((name) => `f${name}: ${name}`).join("\n")}\n}`,
    );
    spec.modules.push({
      id: "scalars",
      name: "scalars",
      description: null,
      operations: [
        {
          id: "set-scalars",
          name: "SET_SCALARS",
          description: null,
          scope: "global",
          schema: `input SetScalarsInput {\n${scalarNames.map((name) => `f${name}: ${name}!`).join("\n")}\n}`,
          reducer: null,
          template: null,
          errors: [],
          examples: [],
        },
      ],
    });
    const model: DocumentModelGlobalState = {
      id: "example/scalar-fixture",
      name: "ScalarFixture",
      description: "",
      extension: ".scalar",
      author: { name: "", website: null },
      specifications: [spec],
    };
    const project = buildTsMorphProject(workDir);
    await generateDocumentModel(model, project);
    await project.save();
  }, 60_000);

  afterAll(() => {
    process.chdir(originalCwd);
    rmSync(workDir, { recursive: true, force: true });
  });

  it.each(["gen/schema/zod.ts", "tests/scalars.test.ts"])(
    "preserves %s for every developer scalar",
    async (file) => {
      const actual = readFileSync(join(versionDir, file), "utf8");
      const golden = fileURLToPath(
        new URL(
          `./goldens/scalar-codegen/every-scalar/${file.replaceAll("/", "-")}.txt`,
          import.meta.url,
        ),
      );
      await expect(actual).toMatchFileSnapshot(golden);
    },
  );
});
