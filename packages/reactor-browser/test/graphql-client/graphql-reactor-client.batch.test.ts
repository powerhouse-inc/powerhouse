import type { BatchExecutionRequest } from "@powerhousedao/reactor";
import type {
  Action,
  ISigner,
  Signature,
} from "@powerhousedao/shared/document-model";
import { serializeSignature } from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ReactorGraphQLClient,
  RunDocumentOptions,
} from "../../src/graphql/types.js";
import {
  GraphQLReactorClient,
  type GraphQLReactorClientOptions,
} from "../../src/graphql-client/graphql-reactor-client.js";
import type {
  ExecuteBatchResult,
  ExecuteBatchVariables,
} from "../../src/graphql-client/operations.js";

type MockSdk = {
  RunDocument: ReturnType<typeof vi.fn>;
  GetJobStatus: ReturnType<typeof vi.fn>;
  GetDocument: ReturnType<typeof vi.fn>;
  SetPreferredEditor: ReturnType<typeof vi.fn>;
};

/** A parent drive the `get` adapter can rebuild, carrying no protocol versions. */
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

const batchPayload: ExecuteBatchResult = {
  executeBatch: {
    jobs: [
      {
        key: "drive",
        job: {
          id: "job-drive",
          status: "READ_READY",
          error: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
        },
      },
      {
        key: "delete",
        job: {
          id: "job-delete",
          status: "READ_READY",
          error: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
        },
      },
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

function createMockSdk(overrides: Partial<MockSdk> = {}): MockSdk {
  return {
    RunDocument: vi.fn().mockResolvedValue(batchPayload),
    GetJobStatus: vi.fn().mockResolvedValue({
      jobStatus: {
        id: "job-x",
        status: "READ_READY",
        error: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
      },
    }),
    GetDocument: vi
      .fn()
      .mockResolvedValue({ document: { document: parentDriveDocument } }),
    SetPreferredEditor: vi
      .fn()
      .mockResolvedValue({ setPreferredEditor: editorDocument }),
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

function batchVariables(sdk: MockSdk): ExecuteBatchVariables {
  const options = sdk.RunDocument.mock.calls[0][0] as RunDocumentOptions;
  return options.variables as ExecuteBatchVariables;
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

    const options = sdk.RunDocument.mock.calls[0][0] as RunDocumentOptions;
    expect(options.operationName).toBe("ExecuteBatch");
    expect(options.operationType).toBe("mutation");

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
    expect(sdk.RunDocument).toHaveBeenCalledTimes(1);
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

  it("throws naming the failed plan key and the partial-state caveat when a job comes back FAILED", async () => {
    const sdk = createMockSdk({
      RunDocument: vi.fn().mockResolvedValue({
        executeBatch: {
          jobs: [
            {
              key: "drive",
              job: {
                id: "job-drive",
                status: "FAILED",
                error: "drive refused the removal",
                createdAt: "2026-01-01T00:00:00.000Z",
                completedAt: "2026-01-01T00:00:01.000Z",
              },
            },
          ],
        },
      }),
    });

    const run = createClientWith(sdk).executeBatch({
      jobs: [removeFileBatch.jobs[0]],
    });

    await expect(run).rejects.toThrow(/Batch job "drive" failed/);
    await expect(run).rejects.toThrow("drive refused the removal");
    await expect(run).rejects.toThrow(/ordering-only, not atomic/);
    await expect(run).rejects.toThrow(
      /re-applies every job that already succeeded/,
    );
  });

  it("rejects when the mutation fails", async () => {
    const sdk = createMockSdk({
      RunDocument: vi.fn().mockRejectedValue(new Error("batch rejected")),
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
  it("returns the documented signature policy default", async () => {
    const policy =
      await createClientWith(createMockSdk()).getCreateSignaturePolicy();
    expect(policy).toBe("v2-required");
  });

  it("reflects the parent drive's own protocol versions, not the hardcoded default", async () => {
    const sdk = createMockSdk({
      GetDocument: vi.fn().mockResolvedValue({
        document: {
          document: {
            ...parentDriveDocument,
            protocolVersions: { "drive-reducer": 3 },
          },
        },
      }),
    });

    const versions =
      await createClientWith(sdk).getCreateProtocolVersions("parent-1");

    expect(versions).toEqual({ "drive-reducer": 3 });
    expect(sdk.GetDocument).toHaveBeenCalledWith(
      { identifier: "parent-1", view: undefined },
      undefined,
      undefined,
    );
  });

  it("falls back to the baseline when the parent reports no protocol versions", async () => {
    const versions =
      await createClientWith(createMockSdk()).getCreateProtocolVersions(
        "parent-1",
      );
    expect(versions).toEqual({ "base-reducer": 2 });
  });

  it("falls back to the baseline when there is no parent", async () => {
    const sdk = createMockSdk();
    const versions = await createClientWith(sdk).getCreateProtocolVersions();
    expect(versions).toEqual({ "base-reducer": 2 });
    expect(sdk.GetDocument).not.toHaveBeenCalled();
  });

  it("maps setPreferredEditor onto the mutation and returns the document", async () => {
    const sdk = createMockSdk();

    const result = await createClientWith(sdk).setPreferredEditor(
      "doc-1",
      "editor-x",
      "main",
    );

    expect(sdk.SetPreferredEditor).toHaveBeenCalledWith(
      {
        documentIdentifier: "doc-1",
        preferredEditor: "editor-x",
        branch: "main",
      },
      undefined,
      undefined,
    );
    expect(result.header.id).toBe("doc-1");
  });

  it("clears the preferred editor by passing null through as undefined", async () => {
    const sdk = createMockSdk();

    await createClientWith(sdk).setPreferredEditor("doc-1", null);

    expect(sdk.SetPreferredEditor.mock.calls[0][0]).toEqual({
      documentIdentifier: "doc-1",
      preferredEditor: undefined,
      branch: undefined,
    });
  });
});
