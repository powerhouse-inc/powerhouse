import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineDocumentModel, ph } from "document-model";
import type { DefinitionDiagnosticV1 } from "@powerhousedao/shared/document-model";
import {
  createDefinitionPackageRevision,
  runDefinitionCheck,
} from "../src/services/definition-check.js";

const profileMocks = vi.hoisted(() => ({ validate: vi.fn() }));

vi.mock("@powerhousedao/reactor-api", () => ({
  validateSubgraphProfile: profileMocks.validate,
}));

const created: string[] = [];

function fixtureProject(): { configFile: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "ph-cli-definition-check-"));
  created.push(root);
  mkdirSync(join(root, "src"));
  const configFile = join(root, "powerhouse.config.json");
  writeFileSync(
    configFile,
    JSON.stringify({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/model.ts" }],
      },
    }),
  );
  writeFileSync(join(root, "src/model.ts"), "export {};\n");
  return { configFile, root };
}

function model() {
  const context = defineDocumentModel({
    id: "test/cli-counter",
    name: "CLI Counter",
    description: "CLI checker fixture",
    extension: "cli-counter",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      global: {
        schema: ph.object("CliCounterState", {
          fields: { value: ph.Int({ required: true }) },
        }),
        initialValue: { value: 0 },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  return context.finalize({ modules: [] });
}

function subgraph() {
  return {
    definition: {
      kind: "powerhouse.subgraph",
      formatVersion: 1,
      name: "test-subgraph",
      compositionPolicy: "host-current",
      federationProfile: "host-current",
      schemaKind: "typed",
      hasSubscriptions: false,
      types: [],
      entries: [],
      scalars: [],
    },
  } as const;
}

afterEach(() => {
  profileMocks.validate.mockReset();
  while (created.length > 0) {
    const path = created.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

describe("definition check service", () => {
  it("loads selected values through the injected import seam", async () => {
    const { configFile } = fixtureProject();
    const importModule = vi.fn(() => Promise.resolve({ CliCounter: model() }));

    const report = await runDefinitionCheck(
      {
        configFile,
        sources: [],
        profile: "edit",
      },
      { importer: { importModule } },
    );

    expect(report.status).toBe("ok");
    expect(report.definitions).toEqual([
      expect.objectContaining({
        kind: "document-model",
        key: "test/cli-counter",
        version: 1,
      }),
    ]);
    expect(importModule).toHaveBeenCalledTimes(1);
  });

  it("runs the host subgraph profile validator and returns its diagnostics", async () => {
    const { configFile } = fixtureProject();
    const diagnostic: DefinitionDiagnosticV1 = {
      code: "PH-GQL-STANDALONE-SCHEMA-INVALID",
      severity: "error",
      phase: "composition",
      path: [],
      message: "The host rejected the standalone schema.",
      repair: "Repair the schema.",
    };
    profileMocks.validate.mockResolvedValueOnce([diagnostic]);
    const importModule = vi.fn(() =>
      Promise.resolve({ TestSubgraph: subgraph() }),
    );

    const report = await runDefinitionCheck(
      {
        configFile,
        sources: [],
        profile: "edit",
      },
      { importer: { importModule } },
    );

    expect(report.status).toBe("invalid");
    expect(report.diagnostics).toContainEqual(diagnostic);
    expect(profileMocks.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: "edit",
        artifacts: [expect.objectContaining({ key: "test-subgraph" })],
      }),
    );
  });

  it("turns a rejected host profile check into a closed diagnostic", async () => {
    const { configFile } = fixtureProject();
    profileMocks.validate.mockRejectedValueOnce(new Error("host details"));

    const report = await runDefinitionCheck(
      { configFile, sources: [], profile: "release" },
      {
        importer: {
          importModule: () => Promise.resolve({ TestSubgraph: subgraph() }),
        },
      },
    );

    expect(report.status).toBe("failed");
    expect(report.diagnostics.map(({ code }) => code)).toContain(
      "PH-GQL-PROFILE-VALIDATION-FAILED",
    );
  });

  it("returns a config diagnostic without scanning or importing a missing root", async () => {
    const { root } = fixtureProject();
    const importModule = vi.fn(() => Promise.resolve({}));

    const report = await runDefinitionCheck(
      {
        configFile: join(root, "missing/powerhouse.config.json"),
        sources: [],
        profile: "edit",
      },
      { importer: { importModule } },
    );

    expect(report.status).toBe("failed");
    expect(report.diagnostics.map(({ code }) => code)).toEqual([
      "PH-CONFIG-SOURCE-INVALID",
    ]);
    expect(importModule).not.toHaveBeenCalled();
  });

  it("changes the package revision when a package source changes", async () => {
    const { configFile, root } = fixtureProject();
    const request = { configFile } as const;
    const before = await createDefinitionPackageRevision(request);
    writeFileSync(join(root, "src/model.ts"), "export const value = 1;\n");
    const after = await createDefinitionPackageRevision(request);

    expect(before).not.toBe(after);
  });

  it("fails closed when source changes during import", async () => {
    const { configFile, root } = fixtureProject();
    const sourcePath = join(root, "src/model.ts");

    const report = await runDefinitionCheck(
      { configFile, sources: [], profile: "edit" },
      {
        importer: {
          importModule: () => {
            writeFileSync(sourcePath, "export const changed = true;\n");
            return Promise.resolve({ CliCounter: model() });
          },
        },
      },
    );

    expect(report.status).toBe("failed");
    expect(report.definitions).toEqual([]);
    expect(report.diagnostics.map(({ code }) => code)).toContain(
      "PH-PKG-SOURCE-REVISION-CHANGED",
    );
  });

  it("includes output-like directory names nested inside source", async () => {
    const { configFile, root } = fixtureProject();
    const nested = join(root, "src/coverage");
    mkdirSync(nested, { recursive: true });
    const helper = join(nested, "helper.ts");
    writeFileSync(helper, "export const value = 1;\n");
    const request = {
      configFile,
    } as const;

    const before = await createDefinitionPackageRevision(request);
    writeFileSync(helper, "export const value = 2;\n");

    await expect(createDefinitionPackageRevision(request)).resolves.not.toBe(
      before,
    );
  });

  it("length-prefixes revision entries to avoid boundary collisions", async () => {
    const { configFile, root } = fixtureProject();
    const first = join(root, "x");
    const second = join(root, "y");
    writeFileSync(first, Buffer.from("a\0y\0b"));
    const request = {
      configFile,
    } as const;
    const oneFile = await createDefinitionPackageRevision(request);

    writeFileSync(first, "a");
    writeFileSync(second, "b");

    await expect(createDefinitionPackageRevision(request)).resolves.not.toBe(
      oneFile,
    );
  });

  it("binds an internal symlink target even when the target directory is excluded", async () => {
    const { configFile, root } = fixtureProject();
    const outputRoot = join(root, "dist");
    const target = join(outputRoot, "generated.ts");
    mkdirSync(outputRoot);
    writeFileSync(target, "export const value = 1;\n");
    symlinkSync("../dist/generated.ts", join(root, "src/generated.ts"), "file");
    const request = {
      configFile,
      outputDirectories: ["dist"],
    } as const;

    const before = await createDefinitionPackageRevision(request);
    writeFileSync(target, "export const value = 2;\n");

    await expect(createDefinitionPackageRevision(request)).resolves.not.toBe(
      before,
    );
  });

  it("checks a definition selected through an in-package file symlink", async () => {
    const { configFile, root } = fixtureProject();
    symlinkSync("model.ts", join(root, "src/linked-model.ts"), "file");
    writeFileSync(
      configFile,
      JSON.stringify({
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [{ specifier: "./src/linked-model.ts" }],
        },
      }),
    );

    const report = await runDefinitionCheck(
      { configFile, sources: [], profile: "edit" },
      {
        importer: {
          importModule: () => Promise.resolve({ CliCounter: model() }),
        },
      },
    );

    expect(report.status).toBe("ok");
    expect(report.definitions).toEqual([
      expect.objectContaining({ key: "test/cli-counter", version: 1 }),
    ]);
  });

  it("rejects package-external symbolic links", async () => {
    const { configFile, root } = fixtureProject();
    const externalRoot = mkdtempSync(join(tmpdir(), "ph-cli-definition-link-"));
    created.push(externalRoot);
    const externalPath = join(externalRoot, "external.ts");
    writeFileSync(externalPath, "export const external = true;\n");
    symlinkSync(externalPath, join(root, "src/external.ts"), "file");

    await expect(
      createDefinitionPackageRevision({ configFile }),
    ).rejects.toThrow(
      "Definition package revision cannot safely include the symbolic link at src/external.ts.",
    );
  });
});
