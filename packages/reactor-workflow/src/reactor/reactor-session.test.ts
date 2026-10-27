// The served facade and the run-scoped drive client, over fakes: what a piece
// reaches of `drives`, and the checks a drive write passes before it is sent.
import type { ReactorClient } from "@powerhousedao/pieces-framework";
import type { ActionCandidate, IReactorClient } from "@powerhousedao/reactor";
import {
  signaturePolicyOf,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { servedClient } from "./reactor-session.js";
import type { RunScope } from "./run-scope.js";
import { RunScopedReactorClient } from "./run-scoped-client.js";

const DRIVE_ID = "drive-1";
const FILE_ID = "file-1";

const file = {
  header: {
    id: FILE_ID,
    documentType: "test/file",
    name: "Invoice",
    branch: "main",
    protocolVersions: {},
  },
} as unknown as PHDocument;

function fakeReactorClient(): ReactorClient {
  const drives = {
    getNode: vi.fn(),
    listNodes: vi.fn(),
    addFile: vi.fn(),
    addFolder: vi.fn(),
    removeNode: vi.fn(),
  };
  return { drives } as unknown as ReactorClient;
}

type Inner = {
  client: IReactorClient;
  get: ReturnType<typeof vi.fn>;
  addFile: ReturnType<typeof vi.fn>;
  addFolder: ReturnType<typeof vi.fn>;
  getNode: ReturnType<typeof vi.fn>;
  evaluateActions: ReturnType<typeof vi.fn>;
};

function fakeInner(driveType: string, decision = "allow"): Inner {
  const get = vi.fn((id: string) =>
    Promise.resolve(
      id === FILE_ID
        ? { ...file, state: { auth: { version: 1 } } }
        : { header: { id: DRIVE_ID, documentType: driveType } },
    ),
  );
  const addFile = vi.fn(() => Promise.resolve(file));
  const addFolder = vi.fn(() => Promise.resolve({ id: "folder-1" }));
  const getNode = vi.fn(() => Promise.resolve({ id: "node-1" }));
  const evaluateActions = vi.fn(
    (_id: string, _branch: string, candidates: ActionCandidate[]) =>
      Promise.resolve({
        evaluations: candidates.map(() => ({ decision, reason: "no grant" })),
      }),
  );
  const client = {
    get,
    evaluateActions,
    getCreateSignaturePolicy: () =>
      Promise.resolve(signaturePolicyOf(file.header)),
    drives: { addFile, addFolder, getNode, listNodes: vi.fn() },
  } as unknown as IReactorClient;
  return { client, get, addFile, addFolder, getNode, evaluateActions };
}

const subject = { address: "0xrun" } as unknown as NonNullable<
  RunScope["runUser"]
>["subject"];

function runScoped(
  inner: Inner,
  requireReactor: "read" | "write" = "write",
  journal = vi.fn(() => Promise.resolve()),
): RunScopedReactorClient {
  return new RunScopedReactorClient(
    inner.client,
    {
      runUser: { address: "0xrun", subject },
      requireReactor,
      connection: { access: requireReactor },
      deadline: Date.now() + 30_000,
      journal: { recordDocuments: journal, recordJob: journal },
    },
    { authEnforcement: true },
  );
}

describe("servedClient's drives", () => {
  it("forwards a served drive method with its arguments and answer", async () => {
    const client = fakeReactorClient();
    const addFile = vi.mocked(client.drives.addFile);
    addFile.mockResolvedValue(file);
    const signal = new AbortController().signal;

    const answer = await servedClient(client).drives.addFile(
      DRIVE_ID,
      file,
      "folder-1",
      signal,
    );

    expect(answer).toBe(file);
    expect(addFile).toHaveBeenCalledWith(DRIVE_ID, file, "folder-1", signal);
    expect(addFile.mock.contexts[0]).toBe(client.drives);
  });

  it("refuses an unserved drive method by name", () => {
    const client = fakeReactorClient();
    const served = servedClient(client);

    expect(() => served.drives.removeNode(DRIVE_ID, "node-1")).toThrow(
      "drives.removeNode is not available to workflow pieces",
    );
    const drives = client.drives as unknown as Record<string, unknown>;
    expect(drives.removeNode).not.toHaveBeenCalled();
  });

  it("holds its own drives object, without a prototype", () => {
    const client = fakeReactorClient();
    const served = servedClient(client);

    expect(Object.getPrototypeOf(served)).toBeNull();
    expect(Object.getPrototypeOf(served.drives)).toBeNull();
    expect(served.drives).not.toBe(client.drives);
    expect(Object.keys(served.drives).sort()).toEqual([
      "addFile",
      "addFolder",
      "copyNode",
      "create",
      "getNode",
      "listNodes",
      "moveNode",
      "removeNode",
      "renameNode",
      "setPreferredEditorOnNode",
    ]);
  });

  it("serves a read declaration drive reads and refuses its drive writes", async () => {
    const inner = fakeInner("powerhouse/document-drive");
    const served = servedClient(runScoped(inner, "read"));

    await expect(served.drives.getNode(DRIVE_ID, "node-1")).resolves.toEqual({
      id: "node-1",
    });
    await expect(served.drives.addFile(DRIVE_ID, file)).rejects.toThrow(
      "drives.addFile writes, and this step declares read access only",
    );
    expect(inner.addFile).not.toHaveBeenCalled();
  });
});

describe("RunScopedReactorClient's drives", () => {
  it("adds a file to a document drive as the run user, journaled and gated", async () => {
    const inner = fakeInner("powerhouse/document-drive");
    const journal = vi.fn(() => Promise.resolve());
    const client = runScoped(inner, "write", journal);

    const answer = await client.drives.addFile(DRIVE_ID, file, "folder-1");

    expect(answer.header.id).toBe(FILE_ID);
    expect(inner.get.mock.calls[0][1]).toEqual({
      scopes: ["document"],
      subject,
    });
    expect(inner.evaluateActions.mock.calls[0].slice(0, 4)).toEqual([
      DRIVE_ID,
      "main",
      [
        {
          scope: "global",
          type: "ADD_FILE",
          input: {
            id: FILE_ID,
            name: "Invoice",
            documentType: "test/file",
            parentFolder: "folder-1",
          },
        },
      ],
      subject,
    ]);
    expect(journal).toHaveBeenCalledWith([DRIVE_ID, FILE_ID]);
    expect(inner.addFile.mock.calls[0].slice(0, 3)).toEqual([
      DRIVE_ID,
      file,
      "folder-1",
    ]);
  });

  it("gates a reactor drive's child relationship, and sends nothing when denied", async () => {
    const inner = fakeInner("powerhouse/reactor-drive", "deny");

    await expect(
      runScoped(inner).drives.addFile(DRIVE_ID, file),
    ).rejects.toThrow("The run user may not apply ADD_RELATIONSHIP");
    expect(inner.addFile).not.toHaveBeenCalled();
  });

  it("gates a folder added and forwards it", async () => {
    const inner = fakeInner("powerhouse/document-drive");

    await expect(
      runScoped(inner).drives.addFolder(DRIVE_ID, "Receipts"),
    ).resolves.toEqual({ id: "folder-1" });
    expect(inner.evaluateActions.mock.calls[0][2]).toEqual([
      {
        scope: "global",
        type: "ADD_FOLDER",
        input: { name: "Receipts", parentFolder: undefined },
      },
    ]);
  });

  it("refuses a document that is not a drive", async () => {
    const inner = fakeInner("test/file");

    await expect(
      runScoped(inner).drives.addFolder(DRIVE_ID, "Receipts"),
    ).rejects.toThrow("is a test/file, not a drive");
    expect(inner.addFolder).not.toHaveBeenCalled();
  });
});

describe("ctx.reactor.query: a read-model index read, answered by the host", () => {
  const request = {
    subgraph: "key-index",
    query: "query ($k: [String!]!) { keyIndex { find(keys: $k) { key } } }",
    variables: { k: ["a"] },
  };

  it("is served, and refused by name on a host that answers no index", async () => {
    const query = vi.fn(() =>
      Promise.resolve({ data: { keyIndex: { find: [] } } }),
    );
    const served = servedClient({
      ...fakeReactorClient(),
      query,
    } as ReactorClient);
    expect(await served.query(request)).toEqual({
      data: { keyIndex: { find: [] } },
    });
    expect(query).toHaveBeenCalledWith(request);

    const inner = fakeInner("powerhouse/document-drive");
    const none = servedClient(runScoped(inner, "read"));
    await expect(none.query(request)).rejects.toThrow(
      /serves no read-model indexes to pieces/,
    );
  });

  it("asks the host as the run user, within the step's deadline", async () => {
    const inner = fakeInner("powerhouse/document-drive");
    const queryIndex = vi.fn(() => Promise.resolve({ data: { ok: true } }));
    const client = new RunScopedReactorClient(
      inner.client,
      {
        runUser: { address: "0xrun", subject },
        requireReactor: "read",
        connection: { access: "read" },
        deadline: Date.now() + 30_000,
        journal: { recordDocuments: vi.fn(), recordJob: vi.fn() },
      },
      { authEnforcement: true, queryIndex },
    );
    expect(await servedClient(client).query(request)).toEqual({
      data: { ok: true },
    });
    expect(queryIndex).toHaveBeenCalledTimes(1);
    const [sent, runUser, signal] = queryIndex.mock.calls[0] as unknown as [
      typeof request,
      { address: string },
      AbortSignal,
    ];
    expect(sent).toEqual(request);
    expect(runUser.address).toBe("0xrun");
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("reads nothing for a run with no user under enforcement, like every other read", async () => {
    const inner = fakeInner("powerhouse/document-drive");
    const queryIndex = vi.fn(() => Promise.resolve({ data: {} }));
    const client = new RunScopedReactorClient(
      inner.client,
      {
        runUser: null,
        requireReactor: "read",
        connection: { access: "read" },
        deadline: Date.now() + 30_000,
        journal: { recordDocuments: vi.fn(), recordJob: vi.fn() },
      },
      { authEnforcement: true, queryIndex },
    );
    await expect(servedClient(client).query(request)).rejects.toThrow();
    expect(queryIndex).not.toHaveBeenCalled();
  });
});
