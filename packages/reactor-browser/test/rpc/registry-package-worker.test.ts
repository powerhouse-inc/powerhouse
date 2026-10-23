import {
  MessageRouter,
  createPortTransport,
  type VersionFingerprint,
} from "@powerhousedao/reactor/rpc";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import * as documentModel from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import * as zod from "zod";
import { connectReactorClient } from "../../src/rpc/connect-reactor.js";
import { ModuleGraph } from "../../src/rpc/module-graph.js";
import type { RegistryPackageWorkerConstruct } from "./registry-package.worker.js";
import { shimSharedDeps } from "./shared-dep-shims.js";

const VERSION: VersionFingerprint = {
  appBuildId: "registry-package-test",
  rpcProtocolVersion: 1,
  models: [],
};

// test/fixtures/registry holds test/versioned-documents' `ph build` output, served as a registry CDN.
const PACKAGE = "versioned-documents";
const TODO_TYPE = "test/todo";

/** The package's models as the page has them; the page has no import map either. */
async function pageModels(): Promise<Record<string, DocumentModelModule>> {
  const graph = new ModuleGraph({
    sharedImports: shimSharedDeps({ "document-model": documentModel, zod }),
  });
  const url = await graph.resolve(
    `${location.origin}/registry/${PACKAGE}/browser/document-models/index.js`,
  );
  return (await import(/* @vite-ignore */ url)) as Record<
    string,
    DocumentModelModule
  >;
}

describe("worker reactor with a registry package", () => {
  const workers: Worker[] = [];

  afterEach(() => {
    for (const worker of workers) worker.terminate();
    workers.length = 0;
  });

  function startWorker(construct: RegistryPackageWorkerConstruct = {}) {
    const worker = new Worker(
      new URL("./registry-package.worker.ts", import.meta.url),
      { type: "module" },
    );
    workers.push(worker);
    const channel = new MessageChannel();
    worker.postMessage({ port: channel.port2 }, [channel.port2]);
    const router = new MessageRouter();
    router.attach(createPortTransport(channel.port1));
    const client = connectReactorClient(router, {
      version: VERSION,
      construct,
    });
    return { router, client };
  }

  it("creates a document of a model registered after boot", async () => {
    const { router, client } = startWorker();
    const drive = await client.createEmpty("powerhouse/document-drive");
    expect(drive.header.id).toBeTruthy();

    await router.request((id) => ({
      k: "register-packages",
      id,
      specs: [PACKAGE],
      sources: [],
    }));

    const todo = await client.createEmpty(TODO_TYPE);
    expect(todo.header.documentType).toBe(TODO_TYPE);
  });

  it("creates a document of a model it finds in the registry on demand", async () => {
    const { client } = startWorker({ discover: { [TODO_TYPE]: PACKAGE } });
    const { TodoV2 } = await pageModels();

    // As a drive app creates one: the page builds the document, the worker's queue loads its model.
    const todo = await client.create(TodoV2.utils.createDocument());
    expect(todo.header.documentType).toBe(TODO_TYPE);
  });
});
