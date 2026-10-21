import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { HostValidationRequest } from "document-model/tooling";
import { afterEach, describe, expect, it } from "vitest";
import { defaultHostValidationFor } from "../src/services/definitions/host-validation.js";

type FakeHosts = Map<string, HostValidationRequest[]>;
const fakeHosts = (): FakeHosts =>
  ((globalThis as { fakeHosts?: FakeHosts }).fakeHosts ??= new Map());

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A project whose installed reactor-api records each request it validates,
 * under the URL of its entry, from the moment it is imported.
 */
function makeProject(): { root: string; hostUrl: string } {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "ph-host-validation-"));
  temporary.push(root);
  const host = join(root, "node_modules", "@powerhousedao", "reactor-api");
  mkdirSync(host, { recursive: true });
  writeFileSync(
    join(host, "package.json"),
    JSON.stringify({ exports: { ".": { import: "./host.mjs" } } }),
  );
  writeFileSync(
    join(host, "host.mjs"),
    [
      "const requests = [];",
      "(globalThis.fakeHosts ??= new Map()).set(import.meta.url, requests);",
      "export function validateSubgraphsForHost(request) {",
      "  requests.push(request);",
      "  return { completed: true, diagnostics: [] };",
      "}",
    ].join("\n"),
  );
  const modelDir = join(root, "document-models", "subgraph-module");
  mkdirSync(modelDir, { recursive: true });
  copyFileSync(
    join(
      import.meta.dirname,
      "../../../packages/vetra/document-models/subgraph-module/subgraph-module.json",
    ),
    join(modelDir, "subgraph-module.json"),
  );
  return { root, hostUrl: pathToFileURL(join(host, "host.mjs")).href };
}

const ledger = {
  value: class Ledger {},
  source: { specifier: "./subgraphs/ledger/index.ts" as const },
  path: [],
};

describe("the default host validation", { timeout: 60_000 }, () => {
  it("hands the host the project's schema-first models beside the selection", async () => {
    const { root, hostUrl } = makeProject();

    const result = await defaultHostValidationFor(root)({
      profile: "edit",
      documentModels: [],
      subgraphs: [ledger],
    });

    expect(result).toEqual({ completed: true, diagnostics: [] });
    expect(
      (fakeHosts().get(hostUrl) ?? []).map(
        ({ subgraphs, schemaFirstDocumentModels }) => ({
          subgraphs,
          models: schemaFirstDocumentModels?.map(({ id, name }) => [id, name]),
        }),
      ),
    ).toEqual([
      {
        subgraphs: [ledger],
        models: [["powerhouse/subgraph", "Subgraph Module"]],
      },
    ]);
  });

  it("hands the host the readable models when another model file is malformed", async () => {
    const { root, hostUrl } = makeProject();
    mkdirSync(join(root, "document-models", "broken"));
    writeFileSync(join(root, "document-models", "broken", "broken.json"), "{");

    const result = await defaultHostValidationFor(root)({
      profile: "edit",
      documentModels: [],
      subgraphs: [ledger],
    });

    expect(result).toEqual({ completed: true, diagnostics: [] });
    expect(
      (fakeHosts().get(hostUrl) ?? []).map(({ schemaFirstDocumentModels }) =>
        schemaFirstDocumentModels?.map(({ id }) => id),
      ),
    ).toEqual([["powerhouse/subgraph"]]);
  });
});
