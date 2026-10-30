import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SCANNED = ["packages", "apps", "clis"];
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  ".tsbuild",
  "test",
  "tests",
  "bench",
  "coverage",
  ".ph",
  "storybook-static",
  "gen",
]);
const SOURCE = /\.(ts|tsx|mts)$/;
const NOT_PRODUCTION = /\.(test|spec|stories|d)\.(ts|tsx|mts)$/;

/** Asking for a new document's versions: selection itself, or delegating it. */
const SELECTS = /\b(?:getCreateProtocolVersions|readCreateProtocolVersions)\(/;

/** Why each file may ask; anywhere else, build the header with newDocument. */
const ALLOWED = new Map<string, string>([
  ["packages/reactor/src/client/types.ts", "the interface"],
  ["packages/reactor/src/client/read-client.ts", "newDocument"],
  [
    "packages/reactor/src/client/reactor-client.ts",
    "forwards to the read half",
  ],
  [
    "packages/reactor/src/client/drive-write-client.ts",
    "drives.create, copies and versionless legacy files",
  ],
  [
    "packages/reactor-drive/src/client/reactor-drive-write-strategy.ts",
    "copies and versionless legacy files",
  ],
  [
    "packages/reactor-router/src/routing-client.ts",
    "forwards to the read half",
  ],
  [
    "packages/reactor-router/src/routing-read-client.ts",
    "delegates to a backend",
  ],
  [
    "packages/reactor-router/src/routing-write-client.ts",
    "versionless legacy headers, delegated to a backend",
  ],
  ["packages/reactor-router/src/backend.ts", "delegates to a client"],
  [
    "packages/reactor-browser/src/graphql-client/graphql-reactor-client.ts",
    "newDocument",
  ],
  [
    "packages/reactor-browser/src/graphql-client/create-defaults.ts",
    "the light client's selection",
  ],
  [
    "packages/reactor-browser/src/remote-controller/remote-controller.ts",
    "heads a new document as newDocument does",
  ],
  [
    "packages/reactor-browser/src/graphql-client/switchboard-backend.ts",
    "delegates to the light client",
  ],
  ["packages/reactor-workflow/src/reactor/run-scoped-client.ts", "newDocument"],
  [
    "packages/reactor-api/src/graphql/reactor/resolvers.ts",
    "createDefaults, the light client's host end",
  ],
  [
    "packages/reactor-browser/src/actions/document.ts",
    "a duplicate keeps its source's versions",
  ],
]);

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        yield* sources(join(dir, entry.name));
      }
    } else if (SOURCE.test(entry.name) && !NOT_PRODUCTION.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

describe("the create choke point", () => {
  const selecting = new Set<string>();
  for (const top of SCANNED) {
    for (const path of sources(join(ROOT, top))) {
      if (SELECTS.test(readFileSync(path, "utf8"))) {
        selecting.add(relative(ROOT, path).split("\\").join("/"));
      }
    }
  }

  it("selects a new document's versions only in client implementations", () => {
    expect([...selecting].filter((file) => !ALLOWED.has(file))).toEqual([]);
  });

  it("drops an allowed file once it stops selecting", () => {
    expect([...ALLOWED.keys()].filter((file) => !selecting.has(file))).toEqual(
      [],
    );
  });
});
