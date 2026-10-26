import type { DocumentChangeEvent } from "@powerhousedao/reactor";
import type { Action } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GetDocumentQuery,
  JobInfoFieldsFragment,
} from "../../src/graphql/gen/schema.js";
import type {
  ReactorGraphQLClient,
  RunDocumentOptions,
} from "../../src/graphql/types.js";
import { JobFailedError } from "../../src/graphql-client/errors.js";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";

const documentPayload: GetDocumentQuery = {
  document: {
    childIds: [],
    document: {
      id: "doc-1",
      slug: "my-doc",
      name: "My Doc",
      documentType: "powerhouse/test",
      state: { global: { name: "hello" }, local: {} },
      createdAtUtcIso: "2026-01-01T00:00:00.000Z",
      lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
      revisionsList: [{ scope: "global", revision: 7 }],
    },
  },
};

const action: Action = {
  id: "action-1",
  type: "SET_NAME",
  timestampUtcMs: "1700000007000",
  input: { name: "world" },
  scope: "global",
};

const coordinate = {
  documentId: "doc-1",
  scope: "global",
  branch: "main",
  operationIndex: 7,
};

function gqlJob(
  status: string,
  overrides: Partial<JobInfoFieldsFragment> = {},
): JobInfoFieldsFragment {
  return {
    id: "job-1",
    documentId: "doc-1",
    status,
    result: null,
    error: null,
    errorName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    consistencyToken: {
      version: 1,
      createdAtUtcIso: "2026-01-01T00:00:00.000Z",
      coordinates: status === "PENDING" ? [] : [coordinate],
    },
    meta: { batchId: "batch-1", batchJobIds: ["job-1"] },
    ...overrides,
  };
}

type MockSdk = {
  GetDocument: ReturnType<typeof vi.fn>;
  RunDocument: ReturnType<typeof vi.fn>;
  MutateDocumentAsync: ReturnType<typeof vi.fn>;
  GetJobStatus: ReturnType<typeof vi.fn>;
  CreateDocument: ReturnType<typeof vi.fn>;
  DeleteDocument: ReturnType<typeof vi.fn>;
};

function createMockSdk(statuses: string[]): MockSdk {
  const queue = [...statuses];
  return {
    GetDocument: vi.fn().mockResolvedValue(documentPayload),
    RunDocument: vi.fn().mockResolvedValue(documentPayload),
    MutateDocumentAsync: vi
      .fn()
      .mockResolvedValue({ mutateDocumentAsync: gqlJob("PENDING") }),
    GetJobStatus: vi.fn().mockImplementation(() => {
      const status = queue.length > 1 ? queue.shift()! : queue[0];
      return Promise.resolve({
        jobStatus: gqlJob(
          status,
          status === "FAILED"
            ? { error: "reducer exploded", errorName: "ReducerError" }
            : {},
        ),
      });
    }),
    CreateDocument: vi.fn().mockResolvedValue({
      createDocument: documentPayload.document!.document,
    }),
    DeleteDocument: vi.fn().mockResolvedValue({ deleteDocument: true }),
  };
}

function clientOver(sdk: MockSdk): GraphQLReactorClient {
  return new GraphQLReactorClient({
    url: "http://localhost:4001/graphql",
    graphqlClient: sdk as unknown as ReactorGraphQLClient,
    realtime: false,
  });
}

beforeEach(() => {
  window.ph = {};
});

afterEach(() => {
  window.ph = {};
  vi.restoreAllMocks();
});

describe("GraphQLReactorClient.write.execute", () => {
  it("submits through executeAsync and returns once the job is accepted", async () => {
    const sdk = createMockSdk(["PENDING"]);
    const client = clientOver(sdk);

    const handle = await client.write.execute("my-doc", "main", [action]);

    expect(handle.jobId).toBe("job-1");
    expect(handle.documentId).toBe("doc-1");
    expect(handle.branch).toBe("main");
    expect(sdk.MutateDocumentAsync).toHaveBeenCalledTimes(1);
    const [variables] = sdk.MutateDocumentAsync.mock.calls[0] as [
      { documentIdentifier: string; actions: Action[]; branch: string },
    ];
    expect(variables.documentIdentifier).toBe("my-doc");
    expect(variables.branch).toBe("main");
    expect(variables.actions.map((a) => a.id)).toEqual(["action-1"]);
    expect(sdk.GetJobStatus).not.toHaveBeenCalled();
  });

  it("resolves written at WRITE_READY and readable at READ_READY, polling jobStatus", async () => {
    const sdk = createMockSdk(["PENDING", "WRITE_READY", "READ_READY"]);
    const client = clientOver(sdk);
    const handle = await client.write.execute("doc-1", "main", [action]);

    const written = await handle.written;
    expect(written.job.status).toBe("WRITE_READY");
    expect(written.token.coordinates).toEqual([coordinate]);
    expect(written.documentId).toBe("doc-1");

    const readable = await handle.readable;
    expect(readable.job.status).toBe("READ_READY");
    expect(sdk.GetJobStatus).toHaveBeenCalledTimes(3);
  });

  it("rejects a stage with JobFailedError when the job FAILED", async () => {
    const sdk = createMockSdk(["PENDING", "FAILED"]);
    const client = clientOver(sdk);
    const handle = await client.write.execute("doc-1", "main", [action]);

    const error = await handle.readable.catch((reason: unknown) => reason);

    expect(JobFailedError.isError(error)).toBe(true);
    expect((error as JobFailedError).message).toBe("reducer exploded");
    expect((error as JobFailedError).job.error?.name).toBe("ReducerError");
  });

  it("reads the document back bounded by the receipt's token", async () => {
    const sdk = createMockSdk(["READ_READY"]);
    const client = clientOver(sdk);
    const handle = await client.write.execute("doc-1", "main", [action]);
    sdk.GetDocument.mockClear();

    const document = await handle.document();

    expect(document.header.id).toBe("doc-1");
    const options = sdk.RunDocument.mock.calls[0][0] as RunDocumentOptions;
    expect(options.operationName).toBe("GetDocumentAtConsistency");
    expect(options.variables).toMatchObject({
      identifier: "doc-1",
      view: { branch: "main" },
      consistency: { version: 1, coordinates: [coordinate] },
    });
    expect(sdk.GetDocument).not.toHaveBeenCalled();
  });

  it("falls back to the plain document query when the Switchboard refuses the consistency argument", async () => {
    const sdk = createMockSdk(["READ_READY"]);
    sdk.RunDocument.mockRejectedValue({
      response: {
        errors: [
          {
            message:
              'Unknown argument "consistency" on field "Query.document".',
          },
        ],
      },
    });
    const client = clientOver(sdk);
    const handle = await client.write.execute("doc-1", "main", [action]);
    sdk.GetDocument.mockClear();

    const document = await handle.document();
    await client.read.get("doc-1", undefined, undefined, {
      version: 1,
      createdAtUtcIso: "",
      coordinates: [coordinate],
    });

    expect(document.header.id).toBe("doc-1");
    expect(sdk.RunDocument).toHaveBeenCalledTimes(1);
    expect(sdk.GetDocument).toHaveBeenCalledTimes(2);
  });

  it("announces the written document as Updated once it is readable", async () => {
    const sdk = createMockSdk(["PENDING", "READ_READY"]);
    const client = clientOver(sdk);
    const events: DocumentChangeEvent[] = [];
    client.read.subscribe({ ids: ["doc-1"] }, (event) => events.push(event));

    const handle = await client.write.execute("doc-1", "main", [action]);
    await handle.document();
    await vi.waitFor(() => expect(events).toHaveLength(1));

    expect(events[0].type).toBe("updated");
    expect(events[0].documents[0].header.id).toBe("doc-1");
    // The announcement and the caller's read-back share one read.
    expect(sdk.RunDocument).toHaveBeenCalledTimes(1);
  });

  it("leaves the facade execute on the synchronous mutation", async () => {
    const sdk = createMockSdk(["READ_READY"]);
    sdk.RunDocument.mockResolvedValue({
      mutateDocument: {
        ...documentPayload.document!.document,
        operations: { items: [] },
      },
    });
    const client = clientOver(sdk);

    await client.execute("doc-1", "main", [action]);

    const options = sdk.RunDocument.mock.calls[0][0] as RunDocumentOptions;
    expect(options.operationName).toBe("MutateDocumentWithOperations");
    expect(sdk.MutateDocumentAsync).not.toHaveBeenCalled();
  });
});

describe("GraphQLReactorClient.write.create and deleteDocument", () => {
  it("creates through the synchronous mutation and hands back a settled handle", async () => {
    const sdk = createMockSdk(["READ_READY"]);
    const client = clientOver(sdk);
    const document = {
      header: { id: "doc-1", documentType: "powerhouse/test" },
    } as never;

    const handle = await client.write.create(document);

    expect(sdk.CreateDocument).toHaveBeenCalledTimes(1);
    expect(handle.jobId).toBe("");
    expect(handle.documentId).toBe("doc-1");
    expect((await handle.readable).job.status).toBe("READ_READY");
    expect((await handle.document()).header.id).toBe("doc-1");
  });

  it("deletes through the synchronous mutation and hands back a settled handle", async () => {
    const sdk = createMockSdk(["READ_READY"]);
    const client = clientOver(sdk);

    const handle = await client.write.deleteDocument("doc-1");

    expect(sdk.DeleteDocument).toHaveBeenCalledTimes(1);
    expect(handle.jobId).toBe("");
    expect((await handle.written).documentId).toBe("doc-1");
  });
});

describe("GraphQLReactorClient.read", () => {
  it("exposes only reads", () => {
    const client = clientOver(createMockSdk(["READ_READY"]));

    expect(Object.keys(client.write).sort()).toEqual([
      "create",
      "deleteDocument",
      "execute",
    ]);
    expect((client.read as unknown as Record<string, unknown>).execute).toBe(
      undefined,
    );
  });

  it("reports a job jobStatus does not know as an error", async () => {
    const sdk = createMockSdk(["READ_READY"]);
    sdk.GetJobStatus.mockResolvedValue({ jobStatus: null });
    const client = clientOver(sdk);

    await expect(client.read.getJobStatus("missing")).rejects.toThrow(
      "Job not found: missing",
    );
  });
});
