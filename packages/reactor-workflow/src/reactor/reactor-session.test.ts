// The served facade and the run-scoped client, over fakes: what a piece
// reaches, and the checks a write passes before it is sent.
import {
  deniedActionIndexes,
  ReactorAccessDeniedError,
  type ReactorClient,
} from "@powerhousedao/pieces-framework";
import type { ActionCandidate, IReactorClient } from "@powerhousedao/reactor";
import {
  setName,
  signaturePolicyOf,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { ReactorActionsDeniedError } from "./reactor-errors.js";
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
  const write = {
    execute: vi.fn(),
    rename: vi.fn(),
    drives: { addFile: vi.fn(), removeNode: vi.fn() },
  };
  return { drives, write } as unknown as ReactorClient;
}

type Inner = {
  client: IReactorClient;
  get: ReturnType<typeof vi.fn>;
  addFile: ReturnType<typeof vi.fn>;
  addFolder: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  waitForJob: ReturnType<typeof vi.fn>;
  getNode: ReturnType<typeof vi.fn>;
  evaluateActions: ReturnType<typeof vi.fn>;
};

// An accepted write as the inner client's write half answers it.
const accepted = (jobId: string, documentId: string) => ({
  jobId,
  jobIds: [jobId],
  documentId,
  branch: "main",
});

function fakeInner(
  driveType: string,
  decide: (type: string) => string = () => "allow",
): Inner {
  const get = vi.fn((id: string) =>
    Promise.resolve(
      id === FILE_ID
        ? { ...file, state: { auth: { version: 1 } } }
        : { header: { id: DRIVE_ID, documentType: driveType } },
    ),
  );
  const addFile = vi.fn(() => Promise.resolve(accepted("job-file", FILE_ID)));
  const addFolder = vi.fn(() =>
    Promise.resolve({
      ...accepted("job-folder", DRIVE_ID),
      nodeId: "folder-1",
    }),
  );
  const execute = vi.fn((id: string) =>
    Promise.resolve(accepted("job-execute", id)),
  );
  const waitForJob = vi.fn((id: string) =>
    Promise.resolve({ id, status: "READ_READY", consistencyToken: {} }),
  );
  const getNode = vi.fn((_drive: string, id: string) =>
    Promise.resolve({ id, kind: id.startsWith("folder") ? "folder" : "file" }),
  );
  const evaluateActions = vi.fn(
    (_id: string, _branch: string, candidates: ActionCandidate[]) =>
      Promise.resolve({
        evaluations: candidates.map(({ type }) => ({
          decision: decide(type),
          reason: "no grant",
        })),
      }),
  );
  const client = {
    get,
    evaluateActions,
    waitForJob,
    getJobStatus: waitForJob,
    resolveIdOrSlug: (id: string) => Promise.resolve(id),
    getCreateSignaturePolicy: () =>
      Promise.resolve(signaturePolicyOf(file.header)),
    drives: { getNode, listNodes: vi.fn() },
    write: { execute, drives: { addFile, addFolder } },
  } as unknown as IReactorClient;
  return {
    client,
    get,
    addFile,
    addFolder,
    execute,
    waitForJob,
    getNode,
    evaluateActions,
  };
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

    await expect(
      served.drives.getNode(DRIVE_ID, "node-1"),
    ).resolves.toMatchObject({
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
    const inner = fakeInner("powerhouse/reactor-drive", () => "deny");

    await expect(
      runScoped(inner).drives.addFile(DRIVE_ID, file),
    ).rejects.toThrow("The run user may not apply ADD_RELATIONSHIP");
    expect(inner.addFile).not.toHaveBeenCalled();
  });

  it("gates a folder added and forwards it", async () => {
    const inner = fakeInner("powerhouse/document-drive");

    await expect(
      runScoped(inner).drives.addFolder(DRIVE_ID, "Receipts"),
    ).resolves.toEqual({ id: "folder-1", kind: "folder" });
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

describe("servedClient's write half", () => {
  it("serves the write half and its drives, refusing the rest by name", async () => {
    const client = fakeReactorClient();
    const execute = vi.mocked(client.write.execute);
    execute.mockResolvedValue("handle" as never);
    const served = servedClient(client);

    await expect(served.write.execute(DRIVE_ID, "main", [])).resolves.toBe(
      "handle",
    );
    expect(() => served.write.rename(DRIVE_ID, "Nope")).toThrow(
      "write.rename is not available to workflow pieces",
    );
    expect(() => served.write.drives.removeNode(DRIVE_ID, "node-1")).toThrow(
      "write.drives.removeNode is not available to workflow pieces",
    );
    expect(Object.getPrototypeOf(served.write)).toBeNull();
    expect(served.write).not.toBe(client.write);
  });

  it("serves a handle's reads only, and only from a client that has them", () => {
    const inner = fakeInner("powerhouse/document-drive");
    const served = servedClient(runScoped(inner));

    expect(Object.keys(served.read).sort()).toEqual([
      "get",
      "getJobStatus",
      "waitForJob",
    ]);
    expect(servedClient(fakeReactorClient()).read).toBeUndefined();
  });
});

describe("RunScopedReactorClient's write half", () => {
  it("answers a handle once accepted, its stages read through its own jobs", async () => {
    const inner = fakeInner("powerhouse/document-drive");
    const journal = vi.fn(() => Promise.resolve());
    const client = runScoped(inner, "write", journal);

    const handle = await client.write.execute(DRIVE_ID, "main", [
      setName("Renamed"),
    ]);

    expect(handle).toMatchObject({
      jobId: "job-execute",
      documentId: DRIVE_ID,
    });
    expect(inner.waitForJob).not.toHaveBeenCalled();
    expect(journal).toHaveBeenCalledWith("job-execute", [DRIVE_ID]);
    await expect(handle.readable).resolves.toMatchObject({
      job: { id: "job-execute", status: "READ_READY" },
    });
  });

  it("refuses to wait for a job it did not submit", async () => {
    const inner = fakeInner("powerhouse/document-drive");
    const client = runScoped(inner);

    await expect(client.read.waitForJob("job-other")).rejects.toMatchObject({
      name: ReactorAccessDeniedError,
      message: "Job job-other was not submitted by this step",
    });
    await expect(client.read.getJobStatus("job-other")).rejects.toThrow(
      "was not submitted by this step",
    );
    expect(inner.waitForJob).not.toHaveBeenCalled();
  });

  it("names the denied actions and their indexes, and sends nothing", async () => {
    const inner = fakeInner("powerhouse/document-drive", (type) =>
      type === "SET_NAME" ? "deny" : "allow",
    );
    const actions = [
      { ...setName("a"), type: "OTHER" },
      setName("b"),
      { ...setName("c"), type: "LAST" },
      setName("d"),
    ];

    const error: unknown = await runScoped(inner)
      .write.execute(DRIVE_ID, "main", actions)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ReactorActionsDeniedError);
    expect(error).toMatchObject({
      name: ReactorAccessDeniedError,
      message:
        "The run user may not apply SET_NAME (no grant), SET_NAME (no grant) to document drive-1; denied action indexes: [1,3]",
      denied: [
        { index: 1, type: "SET_NAME", reason: "no grant" },
        { index: 3, type: "SET_NAME", reason: "no grant" },
      ],
    });
    // What crosses the RPC is name and message; the indexes survive in it.
    const { name, message } = error as Error;
    expect(
      deniedActionIndexes(Object.assign(new Error(message), { name })),
    ).toEqual([1, 3]);
    expect(inner.execute).not.toHaveBeenCalled();
  });

  it("refuses the write half to a read declaration", async () => {
    const inner = fakeInner("powerhouse/document-drive");

    await expect(
      runScoped(inner, "read").write.execute(DRIVE_ID, "main", [setName("x")]),
    ).rejects.toThrow(
      "write.execute writes, and this step declares read access only",
    );
    expect(inner.execute).not.toHaveBeenCalled();
  });
});
