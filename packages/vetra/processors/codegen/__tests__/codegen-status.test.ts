// @vitest-environment node
import { serializeInstall } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import type { PowerhouseConfig } from "@powerhousedao/config";
import { CodegenStatusRegistry } from "@powerhousedao/shared/processors";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseDocumentGen } from "../document-handlers/base-document-gen.js";
import { DocumentCodegenFactory } from "../document-handlers/document-codegen-factory.js";
import type { DocumentCodegenManager } from "../document-handlers/document-codegen-manager.js";

let root: string;
let originalOffline: string | undefined;
let status: CodegenStatusRegistry;
let manager: DocumentCodegenManager;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "vetra-codegen-status-")));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "@acme/stockroom",
        type: "module",
        packageManager: "npm@11.0.0",
        peerDependencies: { "document-model": "6.0.0" },
        devDependencies: { "document-model": "6.0.0" },
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
  status = new CodegenStatusRegistry();
  manager = DocumentCodegenFactory.createManager(
    { PH_CONFIG: {} as PowerhouseConfig, CURRENT_WORKING_DIR: root },
    buildTsMorphProject(root),
    false,
    status,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalOffline === undefined) delete process.env.npm_config_offline;
  else process.env.npm_config_offline = originalOffline;
  rmSync(root, { recursive: true, force: true });
});

const input = (documentId: string, documentType: string, global: object) => ({
  documentId,
  documentType,
  scope: "global",
  branch: "main",
  state: { global },
});

async function generate(strand: ReturnType<typeof input>) {
  await manager.routeAndGenerate(strand);
  expect(status.get(strand.documentId)?.state).toBe("queued");
  expect(await status.waitUntilSettled(strand.documentId, 60_000)).toBe(true);
  return status.get(strand.documentId)!;
}

describe("codegen status", () => {
  it("is skipped, with the reason, for a processor of an unsupported type", async () => {
    const result = await generate(
      input("processor-1", "powerhouse/processor", {
        name: "Stock Indexer",
        type: "graph",
        documentTypes: [{ id: "1", documentType: "acme/stock-item" }],
        processorApps: ["switchboard"],
        status: "CONFIRMED",
      }),
    );

    expect(result).toMatchObject({
      documentType: "powerhouse/processor",
      name: "Stock Indexer",
      state: "skipped",
    });
    expect(result.message).toContain('unsupported type "graph"');
  });

  it("is skipped until a subgraph is confirmed", async () => {
    const result = await generate(
      input("subgraph-1", "powerhouse/subgraph", {
        name: "Stock",
        status: "DRAFT",
      }),
    );

    expect(result.state).toBe("skipped");
    expect(result.message).toContain("is not confirmed (status: DRAFT)");
  });

  it("is done with the files it wrote, after waiting for the install", async () => {
    const states: string[] = [];
    status.subscribe(() => {
      const state = status.get("subgraph-2")?.state;
      if (state && states.at(-1) !== state) states.push(state);
    });

    const result = await generate(
      input("subgraph-2", "powerhouse/subgraph", {
        name: "Stock",
        status: "CONFIRMED",
      }),
    );

    expect(result.state).toBe("done");
    expect(result.files).toContain("subgraphs/stock/index.ts");
    expect(result.files).toContain("package.json");
    expect(states).toEqual([
      "queued",
      "running",
      "waiting-for-install",
      "running",
      "done",
    ]);
  }, 60_000);

  it("is failed, with the error, when generation throws", async () => {
    const result = await generate(
      input("editor-1", "powerhouse/document-editor", {
        name: "Stock Editor",
        documentTypes: [
          { id: "1", documentType: "acme/stock-item" },
          { id: "2", documentType: "acme/stock-count" },
        ],
        status: "CONFIRMED",
      }),
    );

    expect(result).toMatchObject({ name: "Stock Editor", state: "failed" });
    expect(result.message).toContain(
      "Multiple document types are not supported yet",
    );
  });
});

describe("codegen and installs", () => {
  it("waits for a running install before it generates", async () => {
    let finishInstall = () => {};
    const install = serializeInstall(
      () =>
        new Promise<void>((resolve) => {
          finishInstall = resolve;
        }),
    );
    const strand = input("subgraph-3", "powerhouse/subgraph", {
      name: "Stock",
      status: "CONFIRMED",
    });

    await manager.routeAndGenerate(strand);
    await vi.waitFor(
      () =>
        expect(status.get("subgraph-3")).toMatchObject({
          state: "waiting-for-install",
          message: "Waiting for a dependency install to finish",
        }),
      { timeout: 5_000 },
    );
    expect(existsSync(join(root, "subgraphs"))).toBe(false);

    finishInstall();
    await install;
    expect(await status.waitUntilSettled("subgraph-3", 60_000)).toBe(true);
    expect(status.get("subgraph-3")?.state).toBe("done");
  }, 60_000);

  // A generator that needs a module the install has not linked yet.
  class LinkingGenerator extends BaseDocumentGen {
    readonly supportedDocumentTypes = "acme/linking";
    attempts = 0;
    failures = 1;
    error = (): Promise<void> =>
      import(`@acme/not-linked-${this.attempts}`).then(() => undefined);

    async generate(): Promise<void> {
      this.attempts++;
      if (this.attempts <= this.failures) await this.error();
    }
  }

  function linking(failures: number, error?: () => Promise<void>) {
    manager.registerGenerator("acme/linking", LinkingGenerator);
    const generator = manager.getGenerator("acme/linking") as LinkingGenerator;
    generator.failures = failures;
    if (error) generator.error = error;
    manager.retryDelayMs = 0;
    return generator;
  }

  it("retries once a job that failed to resolve a module", async () => {
    const generator = linking(1);

    const result = await generate(input("linking-1", "acme/linking", {}));

    expect(result.state).toBe("done");
    expect(generator.attempts).toBe(2);
  });

  it("fails a job that still cannot resolve the module after its retry", async () => {
    const generator = linking(2);

    const result = await generate(input("linking-2", "acme/linking", {}));

    expect(result.state).toBe("failed");
    expect(result.message).toContain("@acme/not-linked-2");
    expect(result.message).toContain("also after a retry");
    expect(generator.attempts).toBe(2);
  });

  it("does not retry other failures", async () => {
    const generator = linking(1, () => Promise.reject(new Error("bad spec")));

    const result = await generate(input("linking-3", "acme/linking", {}));

    expect(result).toMatchObject({ state: "failed", message: "bad spec" });
    expect(generator.attempts).toBe(1);
  });

  it("runs one job at a time", async () => {
    let running = 0;
    let overlapped = false;
    const generator = linking(Infinity, async () => {
      running++;
      if (running > 1) overlapped = true;
      await new Promise((resolve) => setTimeout(resolve, 200));
      running--;
    });

    await manager.routeAndGenerate(input("linking-4", "acme/linking", {}));
    await manager.routeAndGenerate(input("linking-5", "acme/linking", {}));
    expect(await status.waitUntilSettled(undefined, 10_000)).toBe(true);

    expect(overlapped).toBe(false);
    expect(generator.attempts).toBe(2);
  });
});
