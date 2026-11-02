import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrUpdateManifest,
  getOrCreateManifestFile,
  pruneManifestSection,
} from "./manifest.js";

let projectDir: string;
const manifestPath = () => join(projectDir, "powerhouse.manifest.json");
const readManifestText = () => readFileSync(manifestPath(), "utf8");
const writeManifestText = (text: string) => writeFileSync(manifestPath(), text);

const handEdited = `{
    "name": "@acme/things",
    "registry": "https://registry.example.com",
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
  it("keeps unknown keys and extra entry fields after the schema's keys", async () => {
    writeManifestText(handEdited);
    await createOrUpdateManifest(
      { subgraphs: [{ name: "billing", id: "billing" }] },
      projectDir,
    );
    expect(readManifestText()).toBe(`{
  "name": "@acme/things",
  "publisher": {},
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
      "id": "billing",
      "name": "billing"
    }
  ],
  "config": [],
  "registry": "https://registry.example.com"
}
`);
  });

  it("keeps an unknown key named like an object property", async () => {
    writeManifestText(
      JSON.stringify({ name: "@acme/things", constructor: "kept" }),
    );
    await createOrUpdateManifest({}, projectDir);
    expect(JSON.parse(readManifestText())).toStrictEqual({
      name: "@acme/things",
      publisher: {},
      documentModels: [],
      editors: [],
      apps: [],
      processors: [],
      subgraphs: [],
      config: [],
      constructor: "kept",
    });
  });
});

describe("getOrCreateManifestFile", () => {
  it("returns the unknown keys it read", async () => {
    writeManifestText(handEdited);
    const manifest = await getOrCreateManifestFile(manifestPath());
    expect(manifest).toMatchObject({
      registry: "https://registry.example.com",
      documentModels: [
        { id: "acme/invoice", name: "Invoice", owner: "billing-team" },
      ],
    });
  });
});

describe("pruneManifestSection", () => {
  it("removes stale entries and keeps unknown keys", async () => {
    writeManifestText(handEdited);
    await pruneManifestSection(projectDir, "subgraphs", []);
    expect(JSON.parse(readManifestText())).toStrictEqual({
      name: "@acme/things",
      documentModels: [
        { id: "acme/invoice", name: "Invoice", owner: "billing-team" },
      ],
      apps: [],
      editors: [],
      processors: [],
      subgraphs: [],
      registry: "https://registry.example.com",
    });
  });
});
