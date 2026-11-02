// @vitest-environment node
import {
  ANALYTICS_ENGINE_CORE_PACKAGE,
  REACTOR_API_PACKAGE,
} from "@powerhousedao/shared/clis";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import type { PowerhouseConfig } from "@powerhousedao/config";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessorGenerator } from "../document-handlers/generators/processor-generator.js";
import { SubgraphGenerator } from "../document-handlers/generators/subgraph-generator.js";

const PIN = "6.0.0";
let root: string;
let originalOffline: string | undefined;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "vetra-feature-deps-")));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "@acme/stockroom",
        type: "module",
        packageManager: "npm@11.0.0",
        peerDependencies: { "document-model": PIN },
        devDependencies: { "document-model": PIN },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  // The install runs for real; offline it fails fast, and generation goes on.
  originalOffline = process.env.npm_config_offline;
  process.env.npm_config_offline = "true";
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalOffline === undefined) delete process.env.npm_config_offline;
  else process.env.npm_config_offline = originalOffline;
  rmSync(root, { recursive: true, force: true });
});

const config = () => ({
  PH_CONFIG: {} as PowerhouseConfig,
  CURRENT_WORKING_DIR: root,
});

const readManifest = () =>
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<
    "peerDependencies" | "devDependencies",
    Record<string, string>
  >;

const input = (documentType: string, global: object) => ({
  documentId: "doc-1",
  documentType,
  scope: "global",
  branch: "main",
  state: { global },
});

describe("Vetra codegen and feature dependencies", () => {
  it("adds reactor-api to a project when it confirms a subgraph", async () => {
    const generator = new SubgraphGenerator(
      config(),
      buildTsMorphProject(root),
    );

    await generator.generate(
      input("powerhouse/subgraph", { name: "Stock", status: "CONFIRMED" }),
    );

    expect(existsSync(join(root, "subgraphs/stock/index.ts"))).toBe(true);
    const manifest = readManifest();
    expect(manifest.peerDependencies[REACTOR_API_PACKAGE]).toBe(PIN);
    expect(manifest.devDependencies[REACTOR_API_PACKAGE]).toBe(PIN);
  }, 60_000);

  it("adds analytics-engine-core to a project when it confirms an analytics processor", async () => {
    const generator = new ProcessorGenerator(
      config(),
      buildTsMorphProject(root),
    );

    await generator.generate(
      input("powerhouse/processor", {
        name: "Stock Indexer",
        type: "analytics",
        documentTypes: [{ id: "1", documentType: "acme/stock-item" }],
        processorApps: ["switchboard"],
        status: "CONFIRMED",
      }),
    );

    expect(existsSync(join(root, "processors/stock-indexer/index.ts"))).toBe(
      true,
    );
    const manifest = readManifest();
    expect(manifest.peerDependencies[ANALYTICS_ENGINE_CORE_PACKAGE]).toBe(PIN);
    expect(manifest.devDependencies[ANALYTICS_ENGINE_CORE_PACKAGE]).toBe(PIN);
  }, 60_000);
});
