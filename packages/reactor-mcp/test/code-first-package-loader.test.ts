import type * as vite from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  materializeLoaderPackage,
  observedModels,
  type MaterializedPackage,
} from "../../document-model/test/fixtures/loaders/materialize.js";
import { VitePackageLoader } from "../src/stdio/loader.js";

let fixture: MaterializedPackage;
const servers: vite.ViteDevServer[] = [];
vi.mock("vite", async (importOriginal) => {
  const actual = await importOriginal<typeof vite>();
  return {
    ...actual,
    createServer: async (config: Parameters<typeof actual.createServer>[0]) => {
      const server = await actual.createServer(config);
      servers.push(server);
      return server;
    },
  };
});

beforeAll(() => {
  fixture = materializeLoaderPackage();
});

afterAll(async () => {
  try {
    await Promise.all(servers.map((server) => server.close()));
  } finally {
    fixture.dispose();
  }
});

describe("MCP", () => {
  it("reads the complete documentModel of a code-first package", async () => {
    const loader = new VitePackageLoader(fixture.root, "document-models");
    const models = await loader.load();
    const seen = observedModels(models);
    expect(seen.map((entry) => [entry.id, entry.version])).toEqual([
      ["test/ledger", 1],
      ["test/ledger", 2],
    ]);
    expect(seen[1].specifications.at(-1)!.globalSchema).toContain(
      "type LedgerState",
    );
    expect(
      seen[1].specifications
        .at(-1)!
        .operations.map((op) => op.name)
        .sort(),
    ).toEqual(["AddAmount", "SetCurrency"]);
    for (const operation of seen[1].specifications.at(-1)!.operations) {
      expect(operation.schema, operation.name ?? "").toMatch(/^input \w+Input/);
    }
  }, 60_000);

  it("observes the same thing for the schema-first package", async () => {
    const codeFirst = new VitePackageLoader(fixture.root, "document-models");
    const schemaFirst = new VitePackageLoader(
      fixture.schemaFirstRoot,
      "document-models",
    );
    expect(observedModels(await codeFirst.load())).toEqual(
      observedModels(await schemaFirst.load()),
    );
  }, 60_000);
});
