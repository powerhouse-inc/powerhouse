import type { BatchExecutionResult, JobInfo } from "@powerhousedao/reactor";
import {
  isOperationNotSupported,
  ReactorOperationNotSupportedError,
} from "@powerhousedao/reactor-router";
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser";
import type {
  ISigner,
  PHDocument,
  Signature,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRemoteSwitchboardBackend } from "../../src/store/remote-switchboard-backend.js";

const signature: Signature = ["1", "app-key", "v2:hash", "", "0xsig"];

/** A signer whose signAction records a call and returns a fixed tuple. */
function fakeSigner(): ISigner {
  return {
    user: { address: "0x1", networkId: "eip155", chainId: 1 },
    app: { name: "test", key: "app-key" },
    signAction: vi.fn().mockResolvedValue(signature),
  } as unknown as ISigner;
}

function backendClient(signer: ISigner = fakeSigner()) {
  return createRemoteSwitchboardBackend({
    name: "switchboard-remote",
    graphqlUrl: "http://localhost:4001/graphql",
    signer,
  }).client;
}

/** A completed job so DriveClient.runJobs' waitForJob sees no failure. */
const completedJob = (id: string): JobInfo =>
  ({
    id,
    documentId: "d",
    status: "READ_READY",
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    consistencyToken: {
      version: 1,
      createdAtUtcIso: "2026-01-01T00:00:00.000Z",
      coordinates: [],
    },
    meta: { batchId: id, batchJobIds: [id] },
  }) as unknown as JobInfo;

const batchResult: BatchExecutionResult = {
  jobs: { j: completedJob("job-1") },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("remote Switchboard backend drives", () => {
  it("serves client.drives as the reference DriveClient, not a throwing stub", async () => {
    const client = backendClient();

    const drives = await Promise.resolve(client.drives);

    expect(drives).toBeDefined();
    // The reference DriveClient's choreography methods are real functions now,
    // where the old stub threw a not-supported signal for every one of them.
    expect(typeof drives.removeNode).toBe("function");
    expect(typeof drives.addFolder).toBe("function");
    expect(typeof drives.addFile).toBe("function");
  });

  it("removeNode of a file issues the batch mutation and signs with the threaded signer", async () => {
    const signer = fakeSigner();
    const client = backendClient(signer);

    const drive = {
      header: { id: "drive-1" },
      state: {
        global: {
          nodes: [
            { id: "file-1", kind: "file", name: "f", parentFolder: null },
          ],
        },
      },
    } as unknown as PHDocument;

    vi.spyOn(GraphQLReactorClient.prototype, "get").mockResolvedValue(drive);
    const executeBatch = vi
      .spyOn(GraphQLReactorClient.prototype, "executeBatch")
      .mockResolvedValue(batchResult);

    await client.drives.removeNode("drive-1", "file-1");

    // removeFileNode runs two batches: the drive's DELETE_NODE, then the
    // document delete plus the relationship removal.
    expect(executeBatch).toHaveBeenCalled();
    // The jobs carry signed actions: the threaded signer was used.
    expect(
      (signer.signAction as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(0);
  });

  it("addFolder uses execute, never the batch mutation", async () => {
    const client = backendClient();

    const execute = vi
      .spyOn(GraphQLReactorClient.prototype, "execute")
      .mockImplementation(((
        _id: string,
        _branch: string,
        actions: unknown[],
      ) => {
        const input = (actions[0] as { input: { id: string; name: string } })
          .input;
        return Promise.resolve({
          header: { id: "drive-1" },
          state: {
            global: {
              nodes: [
                {
                  id: input.id,
                  kind: "folder",
                  name: input.name,
                  parentFolder: null,
                },
              ],
            },
          },
        } as unknown as PHDocument);
      }) as never);
    const executeBatch = vi
      .spyOn(GraphQLReactorClient.prototype, "executeBatch")
      .mockResolvedValue(batchResult);

    const node = await client.drives.addFolder("drive-1", "My Folder");

    expect(node.name).toBe("My Folder");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(executeBatch).not.toHaveBeenCalled();
  });

  it("wires the IReactor shim's executeBatch to the GraphQL client", async () => {
    const client = backendClient();
    const executeBatch = vi
      .spyOn(GraphQLReactorClient.prototype, "executeBatch")
      .mockResolvedValue(batchResult);

    const result = await (
      client as unknown as {
        executeBatch: (request: unknown) => Promise<BatchExecutionResult>;
      }
    ).executeBatch({ jobs: [] });

    expect(executeBatch).toHaveBeenCalledTimes(1);
    expect(result).toBe(batchResult);
  });
});

describe("remote Switchboard backend read surface", () => {
  it("serves find by delegating to the GraphQL client rather than refusing", () => {
    const client = backendClient();
    // A `type`/`parentId` search is what the Switchboard findDocuments query
    // honours and what drive enumeration issues, so find must delegate (a
    // thenable), not throw the typed not-supported signal. No server is
    // reachable in this unit test, so the returned promise rejects on the
    // network; swallow it rather than letting it surface as unhandled.
    const result = (
      client as unknown as { find: (search: unknown) => Promise<unknown> }
    ).find({ type: "powerhouse/document-drive" });

    expect(typeof result.then).toBe("function");
    result.catch(() => undefined);
  });

  it("refuses a find naming ids with the typed signal the router excludes on", () => {
    const client = backendClient();
    let thrown: unknown;
    try {
      (client as unknown as { find: (search: unknown) => unknown }).find({
        ids: ["doc-1"],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReactorOperationNotSupportedError);
    expect(isOperationNotSupported(thrown)).toBe(true);
    const typed = thrown as ReactorOperationNotSupportedError;
    expect(typed.backend).toBe("switchboard-remote");
    expect(typed.operation).toBe("find");
    expect(typed.message).toMatch(/type and parentId/);
  });

  it("refuses a find naming slugs with the typed signal", () => {
    const client = backendClient();

    expect(() =>
      (client as unknown as { find: (search: unknown) => unknown }).find({
        slugs: ["my-doc"],
      }),
    ).toThrow(ReactorOperationNotSupportedError);
  });

  it("refuses a find with a present-but-empty ids array, never returning rows", () => {
    const client = backendClient();
    let thrown: unknown;
    try {
      (client as unknown as { find: (search: unknown) => unknown }).find({
        ids: [],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReactorOperationNotSupportedError);
    expect(isOperationNotSupported(thrown)).toBe(true);
  });

  it("refuses a find with a present-but-empty slugs array", () => {
    const client = backendClient();

    expect(() =>
      (client as unknown as { find: (search: unknown) => unknown }).find({
        slugs: [],
      }),
    ).toThrow(ReactorOperationNotSupportedError);
  });

  it("refuses a mixed type-and-empty-ids find rather than serving all of the type", () => {
    const client = backendClient();

    expect(() =>
      (client as unknown as { find: (search: unknown) => unknown }).find({
        type: "x",
        ids: [],
      }),
    ).toThrow(ReactorOperationNotSupportedError);
  });

  it("refuses a point-in-time view find with the typed signal, not a plain error", () => {
    const client = backendClient();
    let thrown: unknown;
    try {
      (
        client as unknown as {
          find: (search: unknown, view: unknown) => unknown;
        }
      ).find({ type: "powerhouse/document-drive" }, { revision: 3 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReactorOperationNotSupportedError);
    expect(isOperationNotSupported(thrown)).toBe(true);
    const typed = thrown as ReactorOperationNotSupportedError;
    expect(typed.operation).toBe("find");
  });

  it("serves a latest-view (no revision) find by delegating rather than refusing", () => {
    const client = backendClient();
    const result = (
      client as unknown as {
        find: (search: unknown, view: unknown) => Promise<unknown>;
      }
    ).find({ type: "powerhouse/document-drive" }, { branch: "draft" });

    expect(typeof result.then).toBe("function");
    result.catch(() => undefined);
  });

  it("serves the relationship reads by delegating to the GraphQL client", () => {
    const client = backendClient();
    const relationshipClient = client as unknown as {
      getOutgoingRelationships: (id: string, type: string) => Promise<unknown>;
      getIncomingRelationshipEdges: (id: string) => Promise<unknown>;
    };

    const outgoing = relationshipClient.getOutgoingRelationships(
      "doc-1",
      "cites",
    );
    const edges = relationshipClient.getIncomingRelationshipEdges("doc-2");

    expect(typeof outgoing.then).toBe("function");
    expect(typeof edges.then).toBe("function");
    outgoing.catch(() => undefined);
    edges.catch(() => undefined);
  });
});

describe("remote Switchboard backend unsupported-operation signal", () => {
  it("refuses a still-unsupported member with a typed error the router recognises", () => {
    const client = backendClient();
    // A relationship WRITE is not part of the v1 read surface; it must throw the
    // TYPED error the router recognises rather than a generic Error.
    let thrown: unknown;
    try {
      (
        client as unknown as { addRelationship: () => unknown }
      ).addRelationship();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReactorOperationNotSupportedError);
    expect(isOperationNotSupported(thrown)).toBe(true);
    const typed = thrown as ReactorOperationNotSupportedError;
    expect(typed.backend).toBe("switchboard-remote");
    expect(typed.operation).toBe("addRelationship");
    // The helpful served-methods message content is preserved, and now names
    // the batch surface the backend gained.
    expect(typed.message).toMatch(/get, isServed, subscribe, execute/);
    expect(typed.message).toMatch(/executeBatch/);
  });
});
