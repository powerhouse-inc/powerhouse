import type { BatchExecutionRequest } from "@powerhousedao/reactor";
import type { Action, Operation } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { UnsupportedByBackendError } from "../src/backend.js";
import { RoutingReactorClient } from "../src/routing-client.js";
import { UNKNOWN_REACTOR_INFO } from "../src/types.js";
import {
  FakeBackend,
  fakeDocument,
  memoryInfo,
  REMOTE,
  silent,
} from "./stubs.js";

const SENDS = [
  "create",
  "submit.create",
  "executeBatch",
  "loadBatch",
  "getCreateProtocolVersions",
];

function remoteWith(types: () => Promise<readonly string[]>): {
  remote: FakeBackend;
  client: RoutingReactorClient;
} {
  const remote = new FakeBackend("remote", memoryInfo(), REMOTE);
  const client = new RoutingReactorClient(
    [remote.config({ documentTypes: types })],
    { onDiagnostic: silent },
  );
  return { remote, client };
}

function sent(backend: FakeBackend): string[] {
  return backend.methods().filter((method) => SENDS.includes(method));
}

function createBatch(id: string, model: string): BatchExecutionRequest {
  return {
    jobs: [
      {
        key: "create",
        documentId: id,
        scope: "document",
        branch: "main",
        actions: [
          { type: "CREATE_DOCUMENT", scope: "document", input: { model } },
        ] as unknown as Action[],
        dependsOn: [],
      },
    ],
  };
}

describe("documentTypes facts", () => {
  it("reads the document types on refresh, beside static facts", async () => {
    const { client } = remoteWith(() =>
      Promise.resolve(["test/document", "powerhouse/document-drive"]),
    );
    const handle = client.backends[0];

    expect(handle.facts.documentTypes).toBeUndefined();
    await client.refreshFacts();

    expect(handle.facts.known).toBe(true);
    expect(handle.facts.reactor).toEqual(memoryInfo());
    expect([...(handle.facts.documentTypes ?? [])].sort()).toEqual([
      "powerhouse/document-drive",
      "test/document",
    ]);
  });

  it("marks the facts unknown when the document types cannot be read", async () => {
    const remote = new FakeBackend("remote", memoryInfo(), REMOTE);
    const reported: string[] = [];
    const client = new RoutingReactorClient(
      [
        remote.config({
          documentTypes: () =>
            Promise.reject(new Error("Cannot query field documentModels")),
        }),
      ],
      { onDiagnostic: (message) => reported.push(message) },
    );

    await client.refreshFacts();

    const facts = client.backends[0].facts;
    expect(facts.known).toBe(false);
    expect(facts.documentTypes).toBeUndefined();
    expect(facts.reactor).toEqual(memoryInfo());
    expect(reported.join("\n")).toMatch(
      /remote could not report its document types.*documentModels/,
    );
  });

  it("marks the facts unknown when the reactor facts cannot be read", async () => {
    const remote = new FakeBackend("remote", memoryInfo(), REMOTE);
    const client = new RoutingReactorClient(
      [
        remote.config({
          facts: () => Promise.reject(new Error("Cannot query field info")),
          documentTypes: () => Promise.resolve(["test/document"]),
        }),
      ],
      { onDiagnostic: silent },
    );

    await client.refreshFacts();

    const facts = client.backends[0].facts;
    expect(facts.known).toBe(false);
    expect(facts.reactor).toBe(UNKNOWN_REACTOR_INFO);
    expect([...(facts.documentTypes ?? [])]).toEqual(["test/document"]);
  });
});

describe("create pre-check", () => {
  it("refuses a create of a type the target lacks without sending it", async () => {
    const { remote, client } = remoteWith(() =>
      Promise.resolve(["other/type"]),
    );
    await client.refreshFacts();

    const attempt = client.write.create(
      fakeDocument({ id: "doc", documentType: "test/document" }),
    );

    await expect(attempt).rejects.toBeInstanceOf(UnsupportedByBackendError);
    await expect(attempt).rejects.toThrow(
      /create is not supported by reactor backend "remote".*"test\/document"/,
    );
    expect(sent(remote)).toEqual([]);
  });

  it("refuses createAsync, batches that create and a drive create alike", async () => {
    const { remote, client } = remoteWith(() =>
      Promise.resolve(["other/type"]),
    );
    await client.refreshFacts();

    await expect(
      client.createAsync(
        fakeDocument({ id: "doc", documentType: "test/document" }),
      ),
    ).rejects.toBeInstanceOf(UnsupportedByBackendError);
    await expect(
      client.write.executeBatch(createBatch("doc-2", "test/document")),
    ).rejects.toBeInstanceOf(UnsupportedByBackendError);
    await expect(
      client.write.loadBatch({
        jobs: [
          {
            key: "load",
            documentId: "doc-3",
            scope: "document",
            branch: "main",
            operations: [
              {
                action: {
                  type: "CREATE_DOCUMENT",
                  input: { model: "test/document" },
                },
              },
            ] as unknown as Operation[],
            dependsOn: [],
            externalDeps: [],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnsupportedByBackendError);
    await expect(
      client.write.drives.create({ global: { name: "Drive" } }),
    ).rejects.toBeInstanceOf(UnsupportedByBackendError);
    expect(sent(remote)).toEqual([]);
  });

  it("refuses a file added to a drive whose backend lacks its type", async () => {
    const { remote, client } = remoteWith(() =>
      Promise.resolve(["powerhouse/document-drive"]),
    );
    remote.seed(
      fakeDocument({ id: "drive", documentType: "powerhouse/document-drive" }),
    );
    await client.refreshFacts();

    await expect(
      client.write.drives.addFile(
        "drive",
        fakeDocument({ id: "file", documentType: "test/document" }),
      ),
    ).rejects.toBeInstanceOf(UnsupportedByBackendError);
    expect(sent(remote)).toEqual([]);
  });

  it("re-reads the types once before refusing", async () => {
    let served: readonly string[] = [];
    const { remote, client } = remoteWith(() => Promise.resolve(served));
    await client.refreshFacts();
    served = ["test/document"];

    await client.write.create(
      fakeDocument({ id: "doc", documentType: "test/document" }),
    );

    expect(remote.documents.has("doc")).toBe(true);
  });

  it("does not constrain a backend that declares no document types", async () => {
    const local = new FakeBackend("local");
    const client = new RoutingReactorClient([local.config()], {
      onDiagnostic: silent,
    });
    await client.refreshFacts();

    await client.write.create(
      fakeDocument({ id: "doc", documentType: "any/type" }),
    );

    expect(local.documents.has("doc")).toBe(true);
  });
});
