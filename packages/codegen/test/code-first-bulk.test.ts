import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  generateAll,
  generateAllDocumentModels,
  generateAllSubgraphs,
  generateCodeFirstDocumentModel,
  generateSubgraph,
} from "../src/codegen/generate.js";
import { loadCodeFirstInventory } from "../src/file-builders/index.mts";
import { buildTsMorphProject } from "../src/utils/index.mts";
import {
  addTaskVersion2,
  createCodeFirstPackage,
} from "./code-first-package.js";

const TEST_DOC_JSON = fileURLToPath(
  new URL(
    "../../../test/codegen/data/document-models/test-doc/test-doc.json",
    import.meta.url,
  ),
);

let projectDir: string;

const path = (...segments: string[]) => join(projectDir, ...segments);
const read = (...segments: string[]) => readFileSync(path(...segments), "utf8");
const readManifestJson = () =>
  JSON.parse(read("powerhouse.manifest.json")) as unknown;

function writeManifest(value: Record<string, unknown>) {
  writeFileSync(
    path("powerhouse.manifest.json"),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function replaceIn(file: string, from: string, to: string) {
  const text = read(file);
  expect(text).toContain(from);
  writeFileSync(path(file), text.replaceAll(from, to));
}

function aggregates() {
  return readdirSync(path("document-models"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => [name, read("document-models", name)]);
}

async function inProject(generate: (project: Project) => Promise<unknown>) {
  const project = buildTsMorphProject(projectDir);
  await generate(project);
  await project.save();
}

const task = {
  name: "task",
  documentType: "acme-things/task",
  author: { name: "acme-things", website: null },
};
const testDocEntry = { name: "test-doc", id: "powerhouse/test-doc" };
const taskEntry = { name: "Task", id: "acme-things/task" };
const tasksApiEntry = { name: "tasks-api", id: "tasks-api" };
const billingEntry = { name: "billing", id: "billing" };
const oldSubgraphEntry = { name: "old-subgraph", id: "old-subgraph" };

async function scaffoldCodeFirst() {
  await inProject((project) => generateCodeFirstDocumentModel(task, project));
  await inProject((project) => generateSubgraph("tasks-api", project));
}

async function createMixedPackage() {
  writeManifest({ name: "@acme/things", documentModels: [testDocEntry] });
  mkdirSync(path("document-models", "test-doc"));
  copyFileSync(TEST_DOC_JSON, path("document-models/test-doc/test-doc.json"));
  await scaffoldCodeFirst();
  await inProject((project) => generateSubgraph("billing", project));
}

const brokenTaskDiagnostic =
  "PH-IMPORT-FAILED [error/import] ./document-models/task/index.ts (root): This definition source could not be imported. Expected: an importable TypeScript module Received: Error: task is broken Repair: Fix this module or one of its imports, then run the definition check again.";

function breakTaskSource() {
  const definition = "document-models/task/v1/definition.ts";
  writeFileSync(
    path(definition),
    `throw new Error("task is broken");\n${read(definition)}`,
  );
}

const unsupportedVersionDiagnostic =
  "PH-CONFIG-VERSION-UNSUPPORTED [error/configuration] <config> /definitionSources/formatVersion: The definitionSources format version is not one this release reads. Expected: 1 Received: 2 Repair: Set definitionSources.formatVersion to 1, or upgrade ph.";

const SUBGRAPH_IMPORT_FAILURE =
  "PH-IMPORT-FAILED [error/import] ./subgraphs/billing/index.ts (root): This definition source needs the package missing-dependency, which is not installed.";

const unloadableWarning = (section: string, reason: string) =>
  `Kept every ${section} entry in powerhouse.manifest.json: definitionSources in powerhouse.config.json could not be read or loaded.\n${reason}`;

const bannerOnlyIndex = `/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
`;

function selectDefinitionSources(definitionSources: unknown) {
  writeFileSync(
    path("powerhouse.config.json"),
    `${JSON.stringify({ documentModelsDir: "./document-models", definitionSources }, null, 2)}\n`,
  );
}

beforeEach(() => {
  projectDir = createCodeFirstPackage();
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(projectDir, { recursive: true, force: true });
});

describe("bulk generation in a package with both kinds of modules", () => {
  it.each([
    ["generateAllDocumentModels", generateAllDocumentModels],
    ["generateAllSubgraphs", generateAllSubgraphs],
    ["generateAll", generateAll],
  ])("%s keeps the schema-first and code-first entries", async (_, run) => {
    await createMixedPackage();
    await inProject(run);
    expect(readManifestJson()).toMatchObject({
      documentModels: [testDocEntry, taskEntry],
      subgraphs: [tasksApiEntry, billingEntry],
    });
  });

  it("removes entries nothing in the package declares", async () => {
    await createMixedPackage();
    writeManifest({
      name: "@acme/things",
      documentModels: [
        testDocEntry,
        taskEntry,
        { name: "Deleted", id: "acme-things/deleted" },
      ],
      subgraphs: [tasksApiEntry, billingEntry, oldSubgraphEntry],
    });
    await inProject(generateAll);
    expect(readManifestJson()).toMatchObject({
      documentModels: [testDocEntry, taskEntry],
      subgraphs: [tasksApiEntry, billingEntry],
    });
  });

  it("writes the same manifest when it runs again", async () => {
    await createMixedPackage();
    await inProject(generateAll);
    const first = read("powerhouse.manifest.json");
    await inProject(generateAll);
    expect(read("powerhouse.manifest.json")).toBe(first);
  });

  it("re-adds a missing code-first entry and keeps a renamed one", async () => {
    await createMixedPackage();
    writeManifest({
      name: "@acme/things",
      documentModels: [testDocEntry],
      subgraphs: [{ name: "Tasks API", id: "tasks-api" }, billingEntry],
    });
    await inProject(generateAll);
    expect(readManifestJson()).toMatchObject({
      documentModels: [testDocEntry, taskEntry],
      subgraphs: [{ name: "Tasks API", id: "tasks-api" }, billingEntry],
    });
  });

  it.each([
    ["generateAllDocumentModels", generateAllDocumentModels],
    ["generateAll", generateAll],
  ])(
    "%s fails on a broken code-first source while it regenerates a schema-first model",
    async (_, run) => {
      await createMixedPackage();
      breakTaskSource();
      const manifest = read("powerhouse.manifest.json");
      const before = aggregates();
      await expect(inProject(run)).rejects.toThrow(brokenTaskDiagnostic);
      expect(read("powerhouse.manifest.json")).toBe(manifest);
      expect(aggregates()).toStrictEqual(before);
    },
  );

  it("regenerates subgraphs when a code-first model source is broken", async () => {
    await createMixedPackage();
    breakTaskSource();
    writeManifest({
      name: "@acme/things",
      documentModels: [testDocEntry, taskEntry],
      subgraphs: [tasksApiEntry, oldSubgraphEntry],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await inProject(generateAllSubgraphs);
    expect(warn.mock.calls).toStrictEqual([]);
    expect(readManifestJson()).toMatchObject({
      documentModels: [testDocEntry, taskEntry],
      subgraphs: [tasksApiEntry, billingEntry],
    });
  });

  it("keeps every model entry when a schema-first model file cannot be read", async () => {
    await createMixedPackage();
    const deleted = { name: "Deleted", id: "acme-things/deleted" };
    writeManifest({
      name: "@acme/things",
      documentModels: [testDocEntry, taskEntry, deleted],
    });
    writeFileSync(
      path("document-models/test-doc/test-doc.json"),
      JSON.stringify({ id: "powerhouse/test-doc" }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await inProject(generateAllDocumentModels);
    expect(warn.mock.calls).toStrictEqual([
      [
        "Kept every documentModels entry in powerhouse.manifest.json: 1 document model file(s) could not be read (test-doc/test-doc.json).",
      ],
    ]);
    expect(error.mock.calls).toStrictEqual([[expect.any(ZodError)]]);
    expect(readManifestJson()).toMatchObject({
      documentModels: [testDocEntry, taskEntry, deleted],
    });
  });

  it("fails and keeps the manifest when a subgraph cannot be imported", async () => {
    await createMixedPackage();
    replaceIn(
      "subgraphs/billing/index.ts",
      'from "@powerhousedao/reactor-api";',
      'from "missing-dependency";',
    );
    const billing = read("subgraphs/billing/index.ts");
    const manifest = read("powerhouse.manifest.json");
    await expect(inProject(generateAllSubgraphs)).rejects.toThrow(
      SUBGRAPH_IMPORT_FAILURE,
    );
    expect(read("powerhouse.manifest.json")).toBe(manifest);
    expect(read("subgraphs/billing/index.ts")).toBe(billing);
  });

  it("recovers a computed subgraph name through the protocol", async () => {
    await createMixedPackage();
    replaceIn(
      "subgraphs/billing/index.ts",
      'subgraphName = "billing";',
      "subgraphName = BILLING_NAME;",
    );
    writeFileSync(
      path("subgraphs/billing/index.ts"),
      `const BILLING_NAME = "billing";\n${read("subgraphs/billing/index.ts")}`,
    );
    const authored = read("subgraphs/billing/index.ts");
    rmSync(path("subgraphs/index.ts"));
    writeManifest({ name: "@acme/things", subgraphs: [] });
    await inProject(generateAllSubgraphs);
    expect(readManifestJson()).toHaveProperty("subgraphs", [
      billingEntry,
      tasksApiEntry,
    ]);
    expect(read("subgraphs/index.ts")).toContain(
      'import { BillingSubgraph } from "./billing/index.js";',
    );
    expect(read("subgraphs/index.ts")).toContain("export { BillingSubgraph };");
    expect(read("subgraphs/billing/index.ts")).toBe(authored);
  });

  it("fails on an old-style subgraph with the migration message and keeps the manifest", async () => {
    await createMixedPackage();
    mkdirSync(path("subgraphs", "legacy"));
    writeFileSync(
      path("subgraphs/legacy/index.ts"),
      'import { BaseSubgraph } from "@powerhousedao/reactor-api";\n\nexport class LegacySubgraph extends BaseSubgraph {\n  name = "legacy";\n}\n',
    );
    const manifest = read("powerhouse.manifest.json");
    await expect(inProject(generateAllSubgraphs)).rejects.toThrow(
      "LegacySubgraph has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`.",
    );
    expect(read("powerhouse.manifest.json")).toBe(manifest);
  });

  it("repairs a deleted barrel and lists every subgraph again", async () => {
    await createMixedPackage();
    rmSync(path("subgraphs/index.ts"));
    writeManifest({ name: "@acme/things", subgraphs: [] });
    await inProject(generateAllSubgraphs);
    expect(read("subgraphs/index.ts")).toContain(
      'import { BillingSubgraph } from "./billing/index.js";',
    );
    expect(read("subgraphs/index.ts")).toContain(
      'import { TasksApiSubgraph } from "./tasks-api/index.js";',
    );
    expect(readManifestJson()).toMatchObject({
      subgraphs: [billingEntry, tasksApiEntry],
    });
  });

  it("restores a barrel that lost an export", async () => {
    await createMixedPackage();
    const barrel = read("subgraphs/index.ts");
    writeFileSync(
      path("subgraphs/index.ts"),
      barrel.replace("export { TasksApiSubgraph };\n", ""),
    );
    expect(read("subgraphs/index.ts")).not.toBe(barrel);
    await inProject(generateAllSubgraphs);
    expect(read("subgraphs/index.ts")).toBe(barrel);
  });

  it("never writes into an existing subgraph directory", async () => {
    await createMixedPackage();
    rmSync(path("subgraphs/billing/schema.ts"));
    const index = `${read("subgraphs/billing/index.ts")}export const mine = 1;\n`;
    writeFileSync(path("subgraphs/billing/index.ts"), index);
    writeManifest({ name: "@acme/things", subgraphs: [] });
    await expect(
      inProject((project) => generateSubgraph("billing", project)),
    ).rejects.toThrow(/PH-IMPORT-FAILED/);
    expect(readdirSync(path("subgraphs/billing"))).toStrictEqual(["index.ts"]);
    expect(read("subgraphs/billing/index.ts")).toBe(index);
  });
});

describe("bulk generation in a code-first package", () => {
  it.each([
    ["generateAllDocumentModels", generateAllDocumentModels],
    ["generateAll", generateAll],
  ])(
    "%s keeps the model entry and a hand-added export in the aggregates",
    async (_, run) => {
      await scaffoldCodeFirst();
      writeFileSync(
        path("document-models/index.ts"),
        `${read("document-models/index.ts")}export const mine = 1;\n`,
      );
      const before = aggregates();
      await inProject(run);
      expect(readManifestJson()).toMatchObject({
        documentModels: [taskEntry],
      });
      expect(aggregates()).toStrictEqual(before);
    },
  );

  it.each([
    ["generateAllDocumentModels", generateAllDocumentModels],
    ["generateAllSubgraphs", generateAllSubgraphs],
    ["generateAll", generateAll],
  ])(
    "%s leaves the banner-only aggregate of a package with only a subgraph alone",
    async (_, run) => {
      await inProject((project) => generateSubgraph("tasks-api", project));
      writeFileSync(path("document-models/index.ts"), bannerOnlyIndex);
      await inProject(run);
      expect(aggregates()).toStrictEqual([["index.ts", bannerOnlyIndex]]);
      expect(readManifestJson()).toMatchObject({ subgraphs: [tasksApiEntry] });
    },
  );

  it.each([
    ["generateAllDocumentModels", generateAllDocumentModels],
    ["generateAll", generateAll],
  ])(
    "%s resolves while definitionSources selects the generated aggregate",
    async (_, run) => {
      await inProject((project) =>
        generateCodeFirstDocumentModel(task, project),
      );
      selectDefinitionSources({
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./document-models/index.ts" }],
      });
      const manifest = read("powerhouse.manifest.json");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await inProject(run);
      expect(warn.mock.calls).toStrictEqual([]);
      expect(readManifestJson()).toMatchObject({
        documentModels: [taskEntry],
      });
      expect(read("powerhouse.manifest.json")).toBe(manifest);
    },
  );

  it("keeps the subgraph entry", async () => {
    await scaffoldCodeFirst();
    await inProject(generateAllSubgraphs);
    expect(readManifestJson()).toMatchObject({ subgraphs: [tasksApiEntry] });
  });

  it("does not rewrite a manifest that lists every subgraph", async () => {
    await scaffoldCodeFirst();
    writeManifest({
      name: "@acme/things",
      documentModels: [
        { id: "acme/a", name: "A" },
        { id: "acme/a", name: "A again" },
      ],
      subgraphs: [tasksApiEntry],
    });
    const manifest = read("powerhouse.manifest.json");
    await inProject(generateAllSubgraphs);
    expect(read("powerhouse.manifest.json")).toBe(manifest);
  });

  it("re-adds a deleted subgraph entry under its subgraphName", async () => {
    await inProject((project) => generateSubgraph("Widget Feed", project));
    expect(readManifestJson()).toMatchObject({
      subgraphs: [{ id: "widget-feed", name: "Widget Feed" }],
    });
    writeManifest({ name: "@acme/things", subgraphs: [] });
    await inProject(generateAllSubgraphs);
    expect(readManifestJson()).toMatchObject({
      subgraphs: [{ id: "widget-feed", name: "widget-feed" }],
    });
  });

  it.each([
    [
      "generateAllDocumentModels",
      generateAllDocumentModels,
      ["documentModels"],
    ],
    ["generateAll", generateAll, ["documentModels"]],
  ])(
    "%s warns and changes nothing when a code-first source is broken",
    async (_, run, sections) => {
      await scaffoldCodeFirst();
      breakTaskSource();
      const manifest = read("powerhouse.manifest.json");
      const before = aggregates();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await inProject(run);
      expect(warn.mock.calls).toStrictEqual(
        sections.map((section) => [
          unloadableWarning(section, brokenTaskDiagnostic),
        ]),
      );
      expect(read("powerhouse.manifest.json")).toBe(manifest);
      expect(aggregates()).toStrictEqual(before);
    },
  );

  it("logs a schema error only for the schema-first file that fails it", async () => {
    await scaffoldCodeFirst();
    mkdirSync(path("document-models", "broken"));
    writeFileSync(path("document-models/broken/broken.json"), "{}");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await inProject(generateAllDocumentModels);
    expect(error.mock.calls).toStrictEqual([[expect.any(ZodError)]]);
  });

  it("lists a model with two versions once", async () => {
    await scaffoldCodeFirst();
    addTaskVersion2(projectDir);
    writeManifest({ name: "@acme/things", documentModels: [] });
    await inProject(generateAllDocumentModels);
    expect(readManifestJson()).toMatchObject({
      documentModels: [{ id: "acme-things/task", name: "Task" }],
    });
  });
});

describe("bulk generation in a package whose code-first model has no id", () => {
  it.each([
    [
      "generateAllDocumentModels",
      generateAllDocumentModels,
      ["documentModels"],
    ],
    ["generateAll", generateAll, ["documentModels"]],
  ])("%s warns and keeps the manifest", async (_, run, sections) => {
    writeFileSync(
      path("model.ts"),
      'export const model = { reducer: (state: unknown) => state, documentModel: { global: { id: undefined, name: "Live" } } };\n',
    );
    selectDefinitionSources({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./model.ts" }],
    });
    const manifest = JSON.stringify({
      name: "@acme/things",
      documentModels: [{ name: "Live", id: "acme/live" }],
    });
    writeFileSync(path("powerhouse.manifest.json"), manifest);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await inProject(run);
    expect(warn.mock.calls).toStrictEqual(
      sections.map((section) => [
        unloadableWarning(
          section,
          "./model.ts exports a document model without an id or a name, so it cannot be listed in powerhouse.manifest.json. Run ph model check for the details.",
        ),
      ]),
    );
    expect(read("powerhouse.manifest.json")).toBe(manifest);
  });
});

describe("bulk generation in a package with no modules", () => {
  it("creates no manifest and leaves the aggregates alone", async () => {
    writeFileSync(path("document-models/index.ts"), "// mine\n");
    await inProject(generateAll);
    expect(existsSync(path("powerhouse.manifest.json"))).toBe(false);
    expect(read("document-models/index.ts")).toBe("// mine\n");
  });
});

describe("bulk generation in a package whose definitionSources selects nothing", () => {
  const emptySelection = { formatVersion: 1, mode: "code-first", entries: [] };

  it("prunes subgraphs to the ones subgraphs/ declares without a warning", async () => {
    selectDefinitionSources(emptySelection);
    await inProject((project) => generateSubgraph("billing", project));
    writeManifest({
      name: "@acme/things",
      subgraphs: [billingEntry, oldSubgraphEntry],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await inProject(generateAllSubgraphs);
    expect(warn.mock.calls).toStrictEqual([]);
    expect(readManifestJson()).toMatchObject({ subgraphs: [billingEntry] });
  });

  it("prunes document models and leaves the aggregates alone", async () => {
    selectDefinitionSources(emptySelection);
    writeFileSync(path("document-models/index.ts"), "// mine\n");
    writeManifest({
      name: "@acme/things",
      documentModels: [{ name: "Deleted", id: "acme-things/deleted" }],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await inProject(generateAllDocumentModels);
    expect(warn.mock.calls).toStrictEqual([]);
    expect(readManifestJson()).toMatchObject({ documentModels: [] });
    expect(aggregates()).toStrictEqual([["index.ts", "// mine\n"]]);
  });
});

describe("bulk generation in a package whose definitionSources cannot be read", () => {
  it("regenerates subgraphs, which definitionSources does not select", async () => {
    selectDefinitionSources({
      formatVersion: 2,
      mode: "code-first",
      entries: [{ specifier: "./subgraphs/billing/index.ts" }],
    });
    await inProject((project) => generateSubgraph("billing", project));
    writeManifest({
      name: "@acme/things",
      subgraphs: [billingEntry, oldSubgraphEntry],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await inProject(generateAllSubgraphs);
    expect(warn.mock.calls).toStrictEqual([]);
    expect(readManifestJson()).toMatchObject({ subgraphs: [billingEntry] });
  });
});

describe("loadCodeFirstInventory", () => {
  it.each([
    ["no definitionSources", undefined, { kind: "none" }],
    [
      "a schema-first selection",
      { formatVersion: 1, mode: "schema-first" },
      { kind: "none" },
    ],
    [
      "an empty code-first selection",
      { formatVersion: 1, mode: "code-first", entries: [] },
      { kind: "none" },
    ],
    [
      "an unsupported formatVersion",
      { formatVersion: 2, mode: "code-first", entries: [] },
      { kind: "unavailable", reason: unsupportedVersionDiagnostic },
    ],
    [
      "an entry that is not an object",
      { formatVersion: 1, mode: "code-first", entries: [42] },
      {
        kind: "unavailable",
        reason:
          'PH-CONFIG-SOURCE-INVALID [error/configuration] <config> /definitionSources/entries/0: A definition source entry must be a plain object. Expected: { specifier, exportPath? } Received: 42 Repair: Replace this entry with { "specifier": "./src/<module>.ts" }.',
      },
    ],
  ])("for %s", async (_, definitionSources, expected) => {
    selectDefinitionSources(definitionSources);
    expect(await loadCodeFirstInventory(projectDir)).toStrictEqual(expected);
  });

  it("is none without a config file", async () => {
    rmSync(path("powerhouse.config.json"));
    expect(await loadCodeFirstInventory(projectDir)).toStrictEqual({
      kind: "none",
    });
  });
});
