import type {
  BatchExecutionRequest,
  DocumentChangeEvent,
} from "@powerhousedao/reactor";
import type {
  Action,
  ISigner,
  Signature,
} from "@powerhousedao/shared/document-model";
import { serializeSignature } from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExecuteBatchMutation,
  ExecuteBatchMutationVariables,
} from "../../src/graphql/gen/schema.js";
import type {
  ReactorGraphQLClient,
  RunDocumentOptions,
} from "../../src/graphql/types.js";
import {
  BatchJobFailedError,
  GraphQLOperationNotSupportedError,
} from "../../src/graphql-client/errors.js";
import {
  GraphQLReactorClient,
  type GraphQLReactorClientOptions,
} from "../../src/graphql-client/graphql-reactor-client.js";

type MockSdk = {
  ExecuteBatch: ReturnType<typeof vi.fn>;
  RunDocument: ReturnType<typeof vi.fn>;
  GetJobStatus: ReturnType<typeof vi.fn>;
  GetDocument: ReturnType<typeof vi.fn>;
  SetPreferredEditor: ReturnType<typeof vi.fn>;
  GetCreateDefaults: ReturnType<typeof vi.fn>;
};

/** A drive the `get` adapter can rebuild. */
const parentDriveDocument = {
  id: "parent-1",
  slug: "parent-drive",
  name: "Parent Drive",
  documentType: "powerhouse/document-drive",
  state: { global: {}, local: {} },
  createdAtUtcIso: "2026-01-01T00:00:00.000Z",
  lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
  revisionsList: [{ scope: "global", revision: 1 }],
};

const batchPayload: ExecuteBatchMutation = {
  executeBatch: {
    jobs: [
      { key: "drive", job: serverJob("job-drive", "drive-1") },
      { key: "delete", job: serverJob("job-delete", "file-1") },
    ],
  },
};

const editorDocument = {
  id: "doc-1",
  slug: "my-doc",
  name: "My Doc",
  documentType: "powerhouse/test",
  state: { global: {}, local: {} },
  createdAtUtcIso: "2026-01-01T00:00:00.000Z",
  lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
  revisionsList: [{ scope: "global", revision: 1 }],
};

/** Answers a document read with a document whose id is the identifier asked. */
function documentNamed({ identifier }: { identifier: string }) {
  return Promise.resolve({
    document: { document: { ...parentDriveDocument, id: identifier } },
  });
}

function createMockSdk(overrides: Partial<MockSdk> = {}): MockSdk {
  return {
    ExecuteBatch: vi.fn().mockResolvedValue(batchPayload),
    RunDocument: vi.fn(),
    GetJobStatus: vi.fn().mockResolvedValue({
      jobStatus: serverJob("job-x", "doc-1"),
    }),
    GetDocument: vi.fn().mockImplementation(documentNamed),
    SetPreferredEditor: vi
      .fn()
      .mockResolvedValue({ setPreferredEditor: editorDocument }),
    GetCreateDefaults: vi.fn(),
    ...overrides,
  };
}

function createClientWith(
  sdk: MockSdk,
  options: Partial<GraphQLReactorClientOptions> = {},
): GraphQLReactorClient {
  return new GraphQLReactorClient({
    url: "http://localhost:4001/graphql",
    graphqlClient: sdk as unknown as ReactorGraphQLClient,
    ...options,
  });
}

function batchVariables(sdk: MockSdk): ExecuteBatchMutationVariables {
  return sdk.ExecuteBatch.mock.calls[0][0] as ExecuteBatchMutationVariables;
}

const signature: Signature = [
  "1700000007",
  "did:key:test",
  "action-hash",
  "",
  "0xdeadbeef",
];

function installSigner(): {
  signer: ISigner;
  signAction: ReturnType<typeof vi.fn>;
} {
  const signAction = vi.fn().mockResolvedValue(signature);
  const signer = {
    user: { address: "0x1", networkId: "eip155", chainId: 1 },
    app: { name: "test-app", key: "app-key" },
    signAction,
  } as unknown as ISigner;

  window.ph = {
    renown: {
      user: signer.user,
      signer,
    } as unknown as IRenown,
  };

  return { signer, signAction };
}

/** The jobs the reference DriveClient builds to remove a file node. */
const removeFileBatch: BatchExecutionRequest = {
  jobs: [
    {
      key: "drive",
      documentId: "drive-1",
      scope: "global",
      branch: "main",
      actions: [
        {
          id: "act-remove",
          type: "DELETE_NODE",
          timestampUtcMs: "1700000007000",
          input: { id: "file-1" },
          scope: "global",
        },
      ],
      dependsOn: [],
    },
    {
      key: "delete",
      documentId: "file-1",
      scope: "document",
      branch: "main",
      actions: [
        {
          id: "act-delete",
          type: "DELETE_DOCUMENT",
          timestampUtcMs: "1700000007000",
          input: { documentId: "file-1" },
          scope: "document",
        },
      ],
      dependsOn: [],
    },
  ],
};

beforeEach(() => {
  window.ph = {};
});

afterEach(() => {
  window.ph = {};
  vi.restoreAllMocks();
});

describe("GraphQLReactorClient.executeBatch", () => {
  it("maps each job onto the mutation input, keeping the document id and dependsOn", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).executeBatch(removeFileBatch);

    expect(sdk.ExecuteBatch).toHaveBeenCalledTimes(1);

    const jobs = batchVariables(sdk).jobs;
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      key: "drive",
      documentIdOrSlug: "drive-1",
      scope: "global",
      branch: "main",
      dependsOn: [],
    });
    expect(jobs[1]).toMatchObject({
      key: "delete",
      documentIdOrSlug: "file-1",
      scope: "document",
    });
  });

  it("signs each job's actions for the job's own log", async () => {
    const { signAction } = installSigner();
    const sdk = createMockSdk();

    await createClientWith(sdk).executeBatch(removeFileBatch);

    expect(signAction).toHaveBeenCalledTimes(2);
    // The drive job's DELETE_NODE is signed for the drive; the file job's
    // DELETE_DOCUMENT is a document-scope action, signed for the document it names.
    expect(signAction.mock.calls[0][1]).toEqual({
      documentId: "drive-1",
      branch: "main",
    });
    expect(signAction.mock.calls[1][1]).toEqual({
      documentId: "file-1",
      branch: "main",
    });

    const jobs = batchVariables(sdk).jobs;
    expect(jobs[0].actions[0].context?.signer?.signatures).toEqual([
      serializeSignature(signature),
    ]);
  });

  it("signs a create job the push-prediction path would reject", async () => {
    const { signAction } = installSigner();
    const sdk = createMockSdk();

    const createBatch: BatchExecutionRequest = {
      jobs: [
        {
          key: "document",
          documentId: "new-doc",
          scope: "global",
          branch: "main",
          actions: [
            {
              id: "act-create",
              type: "CREATE_DOCUMENT",
              timestampUtcMs: "1700000007000",
              input: { documentId: "new-doc" },
              scope: "global",
            },
            {
              id: "act-upgrade",
              type: "UPGRADE_DOCUMENT",
              timestampUtcMs: "1700000007000",
              input: { documentId: "new-doc" },
              scope: "global",
            },
          ],
          dependsOn: [],
        },
      ],
    };

    await expect(
      createClientWith(sdk).executeBatch(createBatch),
    ).resolves.toBeDefined();
    // No baseline fetch, no reducer prediction: each action is signed bare.
    expect(signAction).toHaveBeenCalledTimes(2);
    expect(sdk.ExecuteBatch).toHaveBeenCalledTimes(1);
  });

  it("leaves an already-signed action untouched so it is not signed twice", async () => {
    const { signAction } = installSigner();
    const sdk = createMockSdk();

    const preSigned: Action = {
      id: "act-remove",
      type: "DELETE_NODE",
      timestampUtcMs: "1700000007000",
      input: { id: "file-1" },
      scope: "global",
      context: {
        signer: {
          user: { address: "0x1", networkId: "eip155", chainId: 1 },
          app: { name: "test-app", key: "app-key" },
          signatures: [signature],
        },
      },
    };

    await createClientWith(sdk).executeBatch({
      jobs: [{ ...removeFileBatch.jobs[0], actions: [preSigned] }],
    });

    expect(signAction).not.toHaveBeenCalled();
    const jobs = batchVariables(sdk).jobs;
    expect(jobs[0].actions[0].context?.signer?.signatures).toEqual([
      serializeSignature(signature),
    ]);
  });

  it("pushes actions unsigned when there is no signer", async () => {
    const sdk = createMockSdk();

    await createClientWith(sdk).executeBatch(removeFileBatch);

    const jobs = batchVariables(sdk).jobs;
    expect(jobs[0].actions[0].context).toBeUndefined();
  });

  it("returns a completed JobInfo per plan key, keyed to rebuild the record", async () => {
    const sdk = createMockSdk();

    const result = await createClientWith(sdk).executeBatch(removeFileBatch);

    expect(Object.keys(result.jobs).sort()).toEqual(["delete", "drive"]);
    expect(result.jobs.drive).toMatchObject({
      id: "job-drive",
      documentId: "drive-1",
      status: "READ_READY",
      completedAtUtcIso: "2026-01-01T00:00:01.000Z",
    });
    expect(result.jobs.delete).toMatchObject({
      id: "job-delete",
      documentId: "file-1",
      status: "READ_READY",
    });
  });

  it("throws BatchJobFailedError with every job's state when a job comes back FAILED", async () => {
    const sdk = createMockSdk({
      ExecuteBatch: vi.fn().mockResolvedValue({
        executeBatch: {
          jobs: [
            { key: "drive", job: serverJob("job-drive", "drive-1") },
            {
              key: "delete",
              job: serverJob("job-delete", "file-1", {
                status: "FAILED",
                error: "file-1 already exists",
                errorName: "DocumentAlreadyExistsError",
              }),
            },
          ],
        },
      }),
    });

    const thrown = await createClientWith(sdk)
      .executeBatch(removeFileBatch)
      .catch((error: unknown) => error);

    expect(BatchJobFailedError.isError(thrown)).toBe(true);
    const error = thrown as BatchJobFailedError;
    expect(error.message).toBe("file-1 already exists");
    expect(error.key).toBe("delete");
    expect(error.jobs.drive.status).toBe("READ_READY");
    expect(error.jobs.delete.error?.name).toBe("DocumentAlreadyExistsError");
    expect((error.cause as Error).name).toBe("DocumentAlreadyExistsError");
  });

  it("does not take a name-only error for a BatchJobFailedError", () => {
    const rebuilt = new Error("file-1 already exists");
    rebuilt.name = "BatchJobFailedError";

    expect(BatchJobFailedError.isError(rebuilt)).toBe(false);
  });

  it("resolves a slug to the document id before signing for it", async () => {
    const { signAction } = installSigner();
    const sdk = createMockSdk({
      GetDocument: vi.fn().mockResolvedValue({
        document: {
          document: { ...parentDriveDocument, id: "drive-1", slug: "my-drive" },
        },
      }),
    });

    await createClientWith(sdk).executeBatch({
      jobs: [{ ...removeFileBatch.jobs[0], documentId: "my-drive" }],
    });

    expect(sdk.GetDocument.mock.calls[0][0]).toMatchObject({
      identifier: "my-drive",
    });
    expect(signAction.mock.calls[0][1]).toEqual({
      documentId: "drive-1",
      branch: "main",
    });
    expect(batchVariables(sdk).jobs[0].documentIdOrSlug).toBe("drive-1");
  });

  it("does not look up a document an earlier job in the batch creates", async () => {
    const { signAction } = installSigner();
    const refusal = new Error(
      "A job that creates a document must be the only job in its batch",
    );
    const sdk = createMockSdk({
      ExecuteBatch: vi.fn().mockRejectedValue(refusal),
    });

    const run = createClientWith(sdk).executeBatch({
      jobs: [
        {
          key: "document",
          documentId: "new-doc",
          scope: "document",
          branch: "main",
          actions: [
            {
              id: "act-create",
              type: "CREATE_DOCUMENT",
              timestampUtcMs: "1700000007000",
              input: { documentId: "new-doc" },
              scope: "document",
            },
          ],
          dependsOn: [],
        },
        {
          key: "rename",
          documentId: "new-doc",
          scope: "global",
          branch: "main",
          actions: [
            {
              id: "act-rename",
              type: "SET_NAME",
              timestampUtcMs: "1700000007000",
              input: { name: "renamed" },
              scope: "global",
            },
          ],
          dependsOn: ["document"],
        },
      ],
    });

    await expect(run).rejects.toThrow(refusal.message);
    expect(sdk.GetDocument).not.toHaveBeenCalled();
    expect(sdk.ExecuteBatch).toHaveBeenCalledTimes(1);
    expect(signAction.mock.calls.map((call) => call[1] as unknown)).toEqual([
      { documentId: "new-doc", branch: "main" },
      { documentId: "new-doc", branch: "main" },
    ]);
  });

  it("signs for the identifier as given when the server has no such document", async () => {
    const { signAction } = installSigner();
    const sdk = createMockSdk({
      GetDocument: vi.fn().mockResolvedValue({ document: null }),
    });

    await createClientWith(sdk).executeBatch({
      jobs: [removeFileBatch.jobs[0]],
    });

    expect(signAction.mock.calls[0][1]).toEqual({
      documentId: "drive-1",
      branch: "main",
    });
  });

  it("does not sign at all when the identifier cannot be resolved", async () => {
    installSigner();
    const sdk = createMockSdk({
      GetDocument: vi.fn().mockRejectedValue(new Error("network down")),
    });

    await expect(
      createClientWith(sdk).executeBatch({ jobs: [removeFileBatch.jobs[0]] }),
    ).rejects.toThrow("network down");
    expect(sdk.ExecuteBatch).not.toHaveBeenCalled();
  });

  it("announces the documents a batch changed and deleted", async () => {
    const sdk = createMockSdk({});
    const client = createClientWith(sdk, { realtime: false });
    const events: DocumentChangeEvent[] = [];
    client.subscribe({}, (event) => events.push(event));

    await client.executeBatch(removeFileBatch);

    expect(
      events.map((event) => ({
        type: event.type,
        ids: event.documents.map((document) => document.header.id),
        childId: event.context?.childId,
      })),
    ).toEqual([
      { type: "deleted", ids: [], childId: "file-1" },
      { type: "updated", ids: ["drive-1"], childId: undefined },
    ]);
  });

  it("reads an announced document on the branch the job wrote to", async () => {
    const coordinate = {
      documentId: "drive-1",
      scope: "global",
      branch: "feature",
      operationIndex: 3,
    };
    const sdk = createMockSdk({
      ExecuteBatch: vi.fn().mockResolvedValue({
        executeBatch: {
          jobs: [
            {
              key: "drive",
              job: serverJob("job-drive", "drive-1", {
                consistencyToken: {
                  version: 1,
                  createdAtUtcIso: "2026-01-01T00:00:01.000Z",
                  coordinates: [coordinate],
                },
              }),
            },
          ],
        },
      }),
    });
    const client = createClientWith(sdk, { realtime: false });
    const events: DocumentChangeEvent[] = [];
    client.subscribe({}, (event) => events.push(event));

    await client.executeBatch({
      jobs: [{ ...removeFileBatch.jobs[0], branch: "feature" }],
    });

    expect(sdk.GetDocument).toHaveBeenCalledTimes(1);
    expect(sdk.GetDocument.mock.calls[0][0]).toMatchObject({
      identifier: "drive-1",
      view: { branch: "feature" },
    });
    expect(events[0].documents[0].header.branch).toBe("feature");
  });

  it("reads nothing back to announce when nobody is subscribed", async () => {
    const sdk = createMockSdk();

    await createClientWith(sdk, { realtime: false }).executeBatch(
      removeFileBatch,
    );

    expect(sdk.GetDocument).not.toHaveBeenCalled();
  });

  it("announces a document a batch created", async () => {
    const sdk = createMockSdk({
      ExecuteBatch: vi.fn().mockResolvedValue({
        executeBatch: {
          jobs: [{ key: "document", job: serverJob("job-doc", "new-doc") }],
        },
      }),
    });
    const client = createClientWith(sdk, { realtime: false });
    const events: DocumentChangeEvent[] = [];
    client.subscribe({}, (event) => events.push(event));

    await client.executeBatch({
      jobs: [
        {
          key: "document",
          documentId: "new-doc",
          scope: "document",
          branch: "main",
          actions: [
            {
              id: "act-create",
              type: "CREATE_DOCUMENT",
              timestampUtcMs: "1700000007000",
              input: { documentId: "new-doc" },
              scope: "document",
            },
          ],
          dependsOn: [],
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("created");
    expect(events[0].documents.map((document) => document.header.id)).toEqual([
      "new-doc",
    ]);
  });

  it("rejects when the mutation fails", async () => {
    const sdk = createMockSdk({
      ExecuteBatch: vi.fn().mockRejectedValue(new Error("batch rejected")),
    });

    await expect(
      createClientWith(sdk).executeBatch(removeFileBatch),
    ).rejects.toThrow("batch rejected");
  });
});

describe("GraphQLReactorClient.waitForJob", () => {
  it("resolves a completed job handed back by the batch without polling", async () => {
    const sdk = createMockSdk();
    const client = createClientWith(sdk);

    const batchResult = await client.executeBatch(removeFileBatch);
    const resolved = await client.waitForJob(batchResult.jobs.drive);

    expect(resolved).toBe(batchResult.jobs.drive);
    expect(resolved.status).toBe("READ_READY");
    expect(sdk.GetJobStatus).not.toHaveBeenCalled();
  });

  it("looks a bare job id up over the jobStatus query", async () => {
    const sdk = createMockSdk();

    const resolved = await createClientWith(sdk).waitForJob("job-x");

    expect(sdk.GetJobStatus).toHaveBeenCalledWith(
      { jobId: "job-x" },
      undefined,
      undefined,
    );
    expect(resolved).toMatchObject({ id: "job-x", status: "READ_READY" });
  });

  it("polls a job that has not settled until it does", async () => {
    const sdk = createMockSdk({
      GetJobStatus: vi
        .fn()
        .mockResolvedValueOnce({
          jobStatus: serverJob("job-x", "doc-1", {
            status: "PENDING",
            completedAt: null,
          }),
        })
        .mockResolvedValueOnce({ jobStatus: serverJob("job-x", "doc-1") }),
    });

    const resolved = await createClientWith(sdk).waitForJob("job-x");

    expect(sdk.GetJobStatus).toHaveBeenCalledTimes(2);
    expect(resolved.status).toBe("READ_READY");
  });

  it("stops polling when aborted", async () => {
    const sdk = createMockSdk({
      GetJobStatus: vi.fn().mockResolvedValue({
        jobStatus: serverJob("job-x", "doc-1", { status: "RUNNING" }),
      }),
    });
    const controller = new AbortController();

    const waiting = createClientWith(sdk).waitForJob(
      "job-x",
      controller.signal,
    );
    controller.abort(new Error("gave up"));

    await expect(waiting).rejects.toThrow("gave up");
  });

  it("throws when a bare job id is unknown", async () => {
    const sdk = createMockSdk({
      GetJobStatus: vi.fn().mockResolvedValue({ jobStatus: null }),
    });

    await expect(createClientWith(sdk).waitForJob("missing")).rejects.toThrow(
      "Job not found: missing",
    );
  });
});

describe("GraphQLReactorClient create defaults and preferred editor", () => {
  const defaults = (
    signaturePolicy: string,
    protocolVersions: unknown = { "base-reducer": 2 },
  ) =>
    vi.fn().mockResolvedValue({
      createDefaults: { signaturePolicy, protocolVersions },
    });

  it("reads the create signature policy from createDefaults", async () => {
    const sdk = createMockSdk({ GetCreateDefaults: defaults("legacy") });

    const policy = await createClientWith(sdk).getCreateSignaturePolicy();

    expect(policy).toBe("legacy");
    expect(sdk.GetCreateDefaults).toHaveBeenCalledWith(
      { parentIdOrSlug: undefined },
      undefined,
      undefined,
    );
  });

  it("reads create protocol versions under the parent from createDefaults", async () => {
    const sdk = createMockSdk({
      GetCreateDefaults: defaults("v2-required", { signature: 2 }),
    });
    const controller = new AbortController();

    const versions = await createClientWith(sdk).getCreateProtocolVersions(
      "parent-1",
      controller.signal,
    );

    expect(versions).toEqual({ signature: 2 });
    expect(sdk.GetCreateDefaults).toHaveBeenCalledWith(
      { parentIdOrSlug: "parent-1" },
      undefined,
      controller.signal,
    );
    expect(sdk.GetDocument).not.toHaveBeenCalled();
  });

  it("refuses a signature policy it does not know rather than defaulting", async () => {
    const sdk = createMockSdk({ GetCreateDefaults: defaults("v3-maybe") });

    await expect(
      createClientWith(sdk).getCreateSignaturePolicy(),
    ).rejects.toThrow("unknown create signature policy: v3-maybe");
  });

  it("refuses malformed protocol versions", async () => {
    for (const malformed of [null, ["signature"], { signature: "2" }]) {
      const sdk = createMockSdk({
        GetCreateDefaults: defaults("v2-required", malformed),
      });

      await expect(
        createClientWith(sdk).getCreateProtocolVersions(),
      ).rejects.toThrow("malformed");
    }
  });

  it("refuses create defaults with a typed error against a Switchboard without createDefaults", async () => {
    const olderServer = Object.assign(new Error("validation failed"), {
      response: {
        status: 400,
        errors: [
          {
            message:
              'Cannot query field "createDefaults" on type "Query". Did you mean "documentModels"?',
            extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
          },
        ],
      },
    });
    const sdk = createMockSdk({
      GetCreateDefaults: vi.fn().mockRejectedValue(olderServer),
    });
    const client = createClientWith(sdk);

    const policy = client.getCreateSignaturePolicy();
    const versions = client.getCreateProtocolVersions("parent-1");

    await expect(policy).rejects.toBeInstanceOf(
      GraphQLOperationNotSupportedError,
    );
    await expect(policy).rejects.toMatchObject({
      operation: "getCreateSignaturePolicy",
    });
    await expect(versions).rejects.toMatchObject({
      operation: "getCreateProtocolVersions",
    });
  });

  it("passes on any other failure untouched", async () => {
    const refused = Object.assign(new Error("forbidden"), {
      response: {
        status: 200,
        errors: [{ message: "Forbidden", extensions: { code: "FORBIDDEN" } }],
      },
    });
    const sdk = createMockSdk({
      GetCreateDefaults: vi.fn().mockRejectedValue(refused),
    });

    await expect(
      createClientWith(sdk).getCreateProtocolVersions("parent-1"),
    ).rejects.toBe(refused);
  });

  it("sets the preferred editor as a signed action through execute", async () => {
    const { signAction } = installSigner();
    const sdk = createMockSdk({
      GetDocument: vi
        .fn()
        .mockResolvedValue({ document: { document: editorDocument } }),
      RunDocument: vi.fn().mockResolvedValue({
        mutateDocument: { ...editorDocument, operations: { items: [] } },
      }),
    });

    const result = await createClientWith(sdk).setPreferredEditor(
      "my-doc",
      "editor-x",
    );

    expect(sdk.SetPreferredEditor).not.toHaveBeenCalled();
    expect(signAction).toHaveBeenCalledTimes(1);
    expect(signAction.mock.calls[0][1]).toEqual({
      documentId: "doc-1",
      branch: "main",
    });
    const options = sdk.RunDocument.mock.calls[0][0] as RunDocumentOptions;
    expect(options.operationName).toBe("MutateDocumentWithOperations");
    const variables = options.variables as {
      documentIdentifier: string;
      branch: string;
      actions: Array<{ type: string; input: unknown }>;
    };
    expect(variables.branch).toBe("main");
    expect(variables.actions[0]).toMatchObject({
      type: "SET_PREFERRED_EDITOR",
      input: { preferredEditor: "editor-x" },
    });
    expect(result.header.id).toBe("doc-1");
  });

  it("clears the preferred editor with a null input", async () => {
    const sdk = createMockSdk({
      GetDocument: vi
        .fn()
        .mockResolvedValue({ document: { document: editorDocument } }),
      RunDocument: vi.fn().mockResolvedValue({
        mutateDocument: { ...editorDocument, operations: { items: [] } },
      }),
    });

    await createClientWith(sdk).setPreferredEditor("doc-1", null);

    const options = sdk.RunDocument.mock.calls[0][0] as RunDocumentOptions;
    const variables = options.variables as {
      actions: Array<{ input: unknown }>;
    };
    expect(variables.actions[0].input).toEqual({ preferredEditor: null });
  });
});

/** A job as the Switchboard's JobInfoFields selection reports it. */
function serverJob(
  id: string,
  documentId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    documentId,
    status: "READ_READY",
    result: null,
    error: null,
    errorName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    consistencyToken: {
      version: 1,
      createdAtUtcIso: "2026-01-01T00:00:01.000Z",
      coordinates: [
        { documentId, scope: "global", branch: "main", operationIndex: 7 },
      ],
    },
    meta: { batchId: "batch-9", batchJobIds: ["job-drive", "job-delete"] },
    ...overrides,
  };
}

describe("jobs carry what the server reported, never placeholders", () => {
  it("waitForJob by id returns the job's real document id, token and batch", async () => {
    const sdk = createMockSdk({
      GetJobStatus: vi
        .fn()
        .mockResolvedValue({ jobStatus: serverJob("job-x", "doc-1") }),
    });

    const job = await createClientWith(sdk).waitForJob("job-x");

    expect(job.documentId).toBe("doc-1");
    expect(job.consistencyToken).toEqual({
      version: 1,
      createdAtUtcIso: "2026-01-01T00:00:01.000Z",
      coordinates: [
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 7,
        },
      ],
    });
    expect(job.meta).toEqual({
      batchId: "batch-9",
      batchJobIds: ["job-drive", "job-delete"],
    });
  });

  it("waitForJob by id keeps a failed job's error class name", async () => {
    const sdk = createMockSdk({
      GetJobStatus: vi.fn().mockResolvedValue({
        jobStatus: serverJob("job-x", "doc-1", {
          status: "FAILED",
          error: "revision moved",
          errorName: "UpgradePreconditionFailedError",
        }),
      }),
    });

    const job = await createClientWith(sdk).waitForJob("job-x");

    expect(job.error?.name).toBe("UpgradePreconditionFailedError");
    expect(job.error?.message).toBe("revision moved");
  });

  it("waitForJob passes the server's unknown-job answer through as the reactor's", async () => {
    const sdk = createMockSdk({
      GetJobStatus: vi.fn().mockResolvedValue({
        jobStatus: serverJob("job-x", "", {
          status: "FAILED",
          error: "Job not found",
          errorName: "Error",
        }),
      }),
    });

    const job = await createClientWith(sdk).waitForJob("job-x");

    expect(job.documentId).toBe("");
    expect(job.status).toBe("FAILED");
  });

  it("executeBatch returns the document id the server resolved, not the one sent", async () => {
    const payload = {
      executeBatch: {
        jobs: [
          { key: "drive", job: serverJob("job-drive", "drive-1") },
          { key: "delete", job: serverJob("job-delete", "file-1") },
        ],
      },
    };
    const sdk = createMockSdk({
      ExecuteBatch: vi.fn().mockResolvedValue(payload),
    });
    const bySlug: BatchExecutionRequest = {
      jobs: [
        { ...removeFileBatch.jobs[0], documentId: "my-drive" },
        removeFileBatch.jobs[1],
      ],
    };

    const result = await createClientWith(sdk).executeBatch(bySlug);

    expect(result.jobs.drive.documentId).toBe("drive-1");
    expect(result.jobs.drive.consistencyToken.coordinates).toEqual([
      {
        documentId: "drive-1",
        scope: "global",
        branch: "main",
        operationIndex: 7,
      },
    ]);
    expect(result.jobs.delete.meta).toEqual({
      batchId: "batch-9",
      batchJobIds: ["job-drive", "job-delete"],
    });
  });
});
