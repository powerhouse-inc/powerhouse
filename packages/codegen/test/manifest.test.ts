import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  createOrUpdateManifest,
  getOrCreateManifestFile,
  pruneManifestSection,
  readManifest,
} from "../src/file-builders/manifest.js";

const initManifest = `{
  "name": "new-project",
  "description": "",
  "category": "",
  "publisher": {
    "name": "",
    "url": ""
  },
  "documentModels": [],
  "apps": [],
  "editors": [],
  "processors": [],
  "subgraphs": [],
  "config": []
}
`;

let projectDir: string;

const manifestPath = () => join(projectDir, "powerhouse.manifest.json");
const readManifestText = () => readFileSync(manifestPath(), "utf8");
const readManifestJson = () => JSON.parse(readManifestText()) as unknown;

function writeManifestText(text: string) {
  writeFileSync(manifestPath(), text);
}

function writePackageJson(value: Record<string, unknown>) {
  writeFileSync(join(projectDir, "package.json"), JSON.stringify(value));
}

const billing = { name: "billing", id: "billing" };

const handEdited = `{
    "name": "@acme/things",
    "importScripts": [],
    "documentModels": [
        {
            "name": "Invoice",
            "id": "acme/invoice",
            "owner": "billing-team"
        }
    ],
    "apps": [],
    "editors": [],
    "processors": [],
    "subgraphs": [
        {
            "name": "old",
            "id": "old"
        }
    ]
}
`;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "ph-manifest-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("createOrUpdateManifest", () => {
  it("writes the manifest ph init writes", async () => {
    writePackageJson({ name: "new-project" });
    await createOrUpdateManifest({ name: "new-project" }, projectDir);
    expect(readManifestText()).toBe(initManifest);
  });

  it("appends to the manifest ph init writes and changes nothing else", async () => {
    writeManifestText(initManifest);
    await createOrUpdateManifest({ subgraphs: [billing] }, projectDir);
    expect(readManifestText()).toBe(`{
  "name": "new-project",
  "description": "",
  "category": "",
  "publisher": {
    "name": "",
    "url": ""
  },
  "documentModels": [],
  "apps": [],
  "editors": [],
  "processors": [],
  "subgraphs": [
    {
      "name": "billing",
      "id": "billing"
    }
  ],
  "config": []
}
`);
  });

  it("rewrites a manifest it wrote the way it always has", async () => {
    writeManifestText(initManifest);
    await createOrUpdateManifest({ subgraphs: [billing] }, projectDir);
    await createOrUpdateManifest(
      { documentModels: [{ name: "Todo", id: "acme-things/todo" }] },
      projectDir,
    );
    expect(readManifestText()).toBe(`{
  "name": "new-project",
  "description": "",
  "category": "",
  "publisher": {
    "name": "",
    "url": ""
  },
  "documentModels": [
    {
      "name": "Todo",
      "id": "acme-things/todo"
    }
  ],
  "apps": [],
  "editors": [],
  "processors": [],
  "subgraphs": [
    {
      "id": "billing",
      "name": "billing"
    }
  ],
  "config": []
}
`);
  });

  it("keeps unknown keys, extra entry fields and the file's indentation", async () => {
    writeManifestText(handEdited);
    await createOrUpdateManifest({ subgraphs: [billing] }, projectDir);
    expect(readManifestText()).toBe(`{
    "name": "@acme/things",
    "documentModels": [
        {
            "id": "acme/invoice",
            "name": "Invoice",
            "owner": "billing-team"
        }
    ],
    "apps": [],
    "editors": [],
    "processors": [],
    "subgraphs": [
        {
            "id": "old",
            "name": "old"
        },
        {
            "name": "billing",
            "id": "billing"
        }
    ],
    "importScripts": [],
    "publisher": {},
    "config": []
}
`);
  });

  it("keeps an unknown key named like an object property", async () => {
    writeManifestText(
      JSON.stringify({ name: "@acme/things", constructor: "kept" }),
    );
    await createOrUpdateManifest({}, projectDir);
    expect(readManifestJson()).toStrictEqual({
      name: "@acme/things",
      constructor: "kept",
      publisher: {},
      documentModels: [],
      editors: [],
      apps: [],
      processors: [],
      subgraphs: [],
      config: [],
    });
  });

  it("creates a missing manifest named after the package", async () => {
    writePackageJson({ name: "@acme/things", type: "module" });
    await createOrUpdateManifest({ subgraphs: [billing] }, projectDir);
    expect(readManifestText()).toBe(`{
  "name": "@acme/things",
  "description": "",
  "category": "",
  "publisher": {
    "name": "",
    "url": ""
  },
  "documentModels": [],
  "apps": [],
  "editors": [],
  "processors": [],
  "subgraphs": [
    {
      "name": "billing",
      "id": "billing"
    }
  ],
  "config": []
}
`);
  });

  it.each([
    [
      "a package.json without a name",
      () => writePackageJson({ type: "module" }),
    ],
    [
      "a package.json whose name is not a string",
      () => writePackageJson({ name: 42 }),
    ],
    ["no package.json", () => {}],
  ])("creates a manifest with an empty name for %s", async (_, setUp) => {
    setUp();
    await createOrUpdateManifest({}, projectDir);
    expect(readManifestText()).toBe(`{
  "name": "",
  "description": "",
  "category": "",
  "publisher": {
    "name": "",
    "url": ""
  },
  "documentModels": [],
  "apps": [],
  "editors": [],
  "processors": [],
  "subgraphs": [],
  "config": []
}
`);
  });

  it("collapses duplicated ids to the first entry", async () => {
    writeManifestText(
      JSON.stringify({
        name: "@acme/things",
        documentModels: [
          { id: "acme/a", name: "First" },
          { id: "acme/a", name: "Second" },
          { id: "acme/b", name: "B" },
        ],
      }),
    );
    await createOrUpdateManifest(
      { documentModels: [{ id: "acme/a", name: "Third" }] },
      projectDir,
    );
    expect(readManifestJson()).toStrictEqual({
      name: "@acme/things",
      documentModels: [
        { id: "acme/a", name: "First" },
        { id: "acme/b", name: "B" },
      ],
      publisher: {},
      editors: [],
      apps: [],
      processors: [],
      subgraphs: [],
      config: [],
    });
  });

  it("replaces config entries by name", async () => {
    writeManifestText(
      JSON.stringify({
        name: "@acme/things",
        config: [
          { name: "API_URL", type: "var" },
          { name: "API_KEY", type: "secret" },
        ],
      }),
    );
    await createOrUpdateManifest(
      { config: [{ name: "API_URL", type: "secret", required: true }] },
      projectDir,
    );
    expect(readManifestJson()).toStrictEqual({
      name: "@acme/things",
      config: [
        { name: "API_KEY", type: "secret" },
        { name: "API_URL", type: "secret", required: true },
      ],
      publisher: {},
      documentModels: [],
      editors: [],
      apps: [],
      processors: [],
      subgraphs: [],
    });
  });

  it("merges a partial publisher into the existing one", async () => {
    writeManifestText(
      JSON.stringify({
        name: "@acme/things",
        publisher: { name: "Acme", url: "https://acme.test" },
      }),
    );
    await createOrUpdateManifest(
      { publisher: { name: "Acme Labs" } },
      projectDir,
    );
    expect(readManifestJson()).toStrictEqual({
      name: "@acme/things",
      publisher: { name: "Acme Labs", url: "https://acme.test" },
      documentModels: [],
      editors: [],
      apps: [],
      processors: [],
      subgraphs: [],
      config: [],
    });
  });

  it("adds no pieces key when neither side has one", async () => {
    writeManifestText(initManifest);
    await createOrUpdateManifest({ name: "@acme/things" }, projectDir);
    expect(readManifestJson()).toStrictEqual({
      name: "@acme/things",
      description: "",
      category: "",
      publisher: { name: "", url: "" },
      documentModels: [],
      apps: [],
      editors: [],
      processors: [],
      subgraphs: [],
      config: [],
    });
  });

  it("returns the manifest it wrote", async () => {
    writeManifestText(handEdited);
    expect(
      await createOrUpdateManifest({ subgraphs: [billing] }, projectDir),
    ).toStrictEqual({
      name: "@acme/things",
      importScripts: [],
      publisher: {},
      documentModels: [
        { id: "acme/invoice", name: "Invoice", owner: "billing-team" },
      ],
      apps: [],
      editors: [],
      processors: [],
      subgraphs: [
        { id: "old", name: "old" },
        { id: "billing", name: "billing" },
      ],
      config: [],
    });
  });

  it("accepts an undefined name and drops it from the file", async () => {
    writeManifestText(initManifest);
    expect(
      await createOrUpdateManifest({ name: undefined }, projectDir),
    ).toStrictEqual({
      name: undefined,
      description: "",
      category: "",
      publisher: { name: "", url: "" },
      documentModels: [],
      apps: [],
      editors: [],
      processors: [],
      subgraphs: [],
      config: [],
    });
    expect(readManifestText()).toBe(
      initManifest.replace('  "name": "new-project",\n', ""),
    );
  });

  it("writes and returns the extra fields of a new entry", async () => {
    writeManifestText(initManifest);
    const owned = { name: "Billing", id: "billing", owner: "team" };
    expect(
      await createOrUpdateManifest({ subgraphs: [owned] }, projectDir),
    ).toMatchObject({ subgraphs: [owned] });
    expect(readManifestJson()).toMatchObject({ subgraphs: [owned] });
  });
});

describe("an invalid manifest", () => {
  const invalid = JSON.stringify({
    name: "@acme/things",
    config: [{ name: "OLD", type: "legacy" }],
  });

  it.each([
    ["readManifest", () => readManifest(projectDir)],
    ["getOrCreateManifestFile", () => getOrCreateManifestFile(manifestPath())],
    [
      "pruneManifestSection",
      () => pruneManifestSection(projectDir, "subgraphs", []),
    ],
    [
      "createOrUpdateManifest",
      () => createOrUpdateManifest({ subgraphs: [billing] }, projectDir),
    ],
  ])(
    "makes %s throw the schema's ZodError and stays untouched",
    async (_, run) => {
      writeManifestText(invalid);
      const rejection = run();
      await expect(rejection).rejects.toBeInstanceOf(ZodError);
      await expect(rejection).rejects.toMatchObject({
        issues: [{ path: ["config", 0, "type"] }],
      });
      expect(readManifestText()).toBe(invalid);
    },
  );
});

describe("readManifest", () => {
  it("returns the file as read and as parsed", async () => {
    writeManifestText(handEdited);
    expect(await readManifest(projectDir)).toStrictEqual({
      raw: {
        name: "@acme/things",
        importScripts: [],
        documentModels: [
          { name: "Invoice", id: "acme/invoice", owner: "billing-team" },
        ],
        apps: [],
        editors: [],
        processors: [],
        subgraphs: [{ name: "old", id: "old" }],
      },
      manifest: {
        name: "@acme/things",
        documentModels: [{ id: "acme/invoice", name: "Invoice" }],
        apps: [],
        editors: [],
        processors: [],
        subgraphs: [{ id: "old", name: "old" }],
      },
    });
    rmSync(manifestPath());
    expect(await readManifest(projectDir)).toBeUndefined();
  });

  it("refuses a file that does not hold a JSON object with the schema's ZodError", async () => {
    writeManifestText("[]");
    const rejection = readManifest(projectDir);
    await expect(rejection).rejects.toBeInstanceOf(ZodError);
    await expect(rejection).rejects.toMatchObject({
      issues: [{ code: "invalid_type", expected: "object", path: [] }],
    });
  });
});

describe("getOrCreateManifestFile", () => {
  it("creates the file named after the package", async () => {
    writePackageJson({ name: "@acme/things" });
    expect(await getOrCreateManifestFile(manifestPath())).toStrictEqual({
      name: "@acme/things",
      description: "",
      category: "",
      publisher: { name: "", url: "" },
      documentModels: [],
      apps: [],
      editors: [],
      processors: [],
      subgraphs: [],
    });
    expect(readManifestText()).toBe(`{
  "name": "@acme/things",
  "description": "",
  "category": "",
  "publisher": {
    "name": "",
    "url": ""
  },
  "documentModels": [],
  "editors": [],
  "apps": [],
  "subgraphs": [],
  "processors": []
}
`);
  });
});

describe("pruneManifestSection", () => {
  it("removes stale entries and keeps unknown keys and indentation", async () => {
    writeManifestText(handEdited);
    await pruneManifestSection(projectDir, "subgraphs", ["billing"]);
    expect(readManifestText()).toBe(`{
    "name": "@acme/things",
    "documentModels": [
        {
            "id": "acme/invoice",
            "name": "Invoice",
            "owner": "billing-team"
        }
    ],
    "apps": [],
    "editors": [],
    "processors": [],
    "subgraphs": [],
    "importScripts": []
}
`);
  });

  it("does not write when every entry is still valid", async () => {
    writeManifestText(handEdited);
    await pruneManifestSection(projectDir, "subgraphs", ["old"]);
    expect(readManifestText()).toBe(handEdited);
    await pruneManifestSection(projectDir, "subgraphs", []);
    expect(readManifestJson()).toMatchObject({
      importScripts: [],
      subgraphs: [],
    });
  });
});
