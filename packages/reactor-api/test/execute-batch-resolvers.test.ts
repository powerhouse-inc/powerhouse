import type { IReactorClient, JobInfo } from "@powerhousedao/reactor";
import type { Action } from "@powerhousedao/shared/document-model";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphQLObjectType } from "graphql";
import { buildSchema } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { executeBatch } from "../src/graphql/reactor/resolvers.js";
import type { ExecutionJobInput } from "../src/graphql/reactor/gen/graphql.js";

const SDL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../src/graphql/reactor/schema.graphql",
  ),
  "utf8",
);

const deleteFileJob: ExecutionJobInput = {
  key: "drive",
  documentIdOrSlug: "drive-1",
  scope: "global",
  branch: "main",
  actions: [
    {
      id: "act-remove",
      type: "DELETE_NODE",
      timestampUtcMs: "2026-01-01T00:00:00.000Z",
      input: { id: "file-1" },
      scope: "global",
    },
  ],
  dependsOn: [],
};

const deleteDocJob: ExecutionJobInput = {
  key: "delete",
  documentIdOrSlug: "file-1",
  scope: "document",
  branch: "main",
  actions: [
    {
      id: "act-delete",
      type: "DELETE_DOCUMENT",
      timestampUtcMs: "2026-01-01T00:00:00.000Z",
      input: { id: "file-1" },
      scope: "document",
    },
  ],
  dependsOn: ["drive"],
};

const completedJob = (id: string, documentId: string): JobInfo =>
  ({
    id,
    documentId,
    status: "READ_READY",
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    completedAtUtcIso: "2026-01-01T00:00:01.000Z",
    consistencyToken: {
      version: 1,
      createdAtUtcIso: "2026-01-01T00:00:01.000Z",
      coordinates: [],
    },
    meta: { batchId: "batch-1", batchJobIds: [id] },
  }) as unknown as JobInfo;

/** A client that records the batch it was handed and returns completed jobs. */
function recordingClient() {
  const pending = {
    jobs: {
      drive: { id: "job-drive", documentId: "drive-1", status: "PENDING" },
      delete: { id: "job-delete", documentId: "file-1", status: "PENDING" },
    },
  };
  const executeBatchSpy = vi.fn().mockResolvedValue(pending);
  const statuses: Record<string, JobInfo> = {
    "job-drive": completedJob("job-drive", "drive-1"),
    "job-delete": completedJob("job-delete", "file-1"),
  };
  const getJobStatusSpy = vi
    .fn()
    .mockImplementation((id: string) => Promise.resolve(statuses[id]));
  return {
    client: {
      executeBatch: executeBatchSpy,
      getJobStatus: getJobStatusSpy,
    } as unknown as IReactorClient,
    executeBatchSpy,
    getJobStatusSpy,
  };
}

describe("executeBatch", () => {
  it("maps each input job onto an ExecutionJobPlan and applies them together", async () => {
    const { client, executeBatchSpy } = recordingClient();

    await executeBatch(client, { jobs: [deleteFileJob, deleteDocJob] });

    expect(executeBatchSpy).toHaveBeenCalledTimes(1);
    const request = executeBatchSpy.mock.calls[0][0] as {
      jobs: Array<{
        key: string;
        documentId: string;
        scope: string;
        branch: string;
        actions: Action[];
        dependsOn: string[];
      }>;
    };
    expect(request.jobs).toHaveLength(2);
    expect(request.jobs[0]).toMatchObject({
      key: "drive",
      documentId: "drive-1",
      scope: "global",
      branch: "main",
      dependsOn: [],
    });
    expect(request.jobs[1]).toMatchObject({
      key: "delete",
      documentId: "file-1",
      scope: "document",
      dependsOn: ["drive"],
    });
  });

  it("passes a client-signed action through as the tuple verification reads", async () => {
    const { client, executeBatchSpy } = recordingClient();

    await executeBatch(client, {
      jobs: [
        {
          ...deleteFileJob,
          actions: [
            {
              ...deleteFileJob.actions[0],
              context: {
                prevOpHash: "deadbeef",
                prevOpIndex: 7,
                signer: {
                  user: { address: "0x1", networkId: "eip155", chainId: 1 },
                  app: { name: "Connect", key: "did:key:z6Mk" },
                  signatures: ["ts, key, hash, prev, 0xsig"],
                },
              },
            },
          ],
        },
      ],
    });

    const submitted = (
      executeBatchSpy.mock.calls[0][0] as { jobs: Array<{ actions: Action[] }> }
    ).jobs[0].actions[0];
    expect(submitted.context?.signer?.signatures).toEqual([
      ["ts", "key", "hash", "prev", "0xsig"],
    ]);
    expect(submitted.context?.prevOpHash).toBe("deadbeef");
  });

  it("defaults a job with no branch to main", async () => {
    const { client, executeBatchSpy } = recordingClient();
    const { branch: _branch, ...noBranch } = deleteFileJob;

    await executeBatch(client, { jobs: [noBranch] });

    const request = executeBatchSpy.mock.calls[0][0] as {
      jobs: Array<{ branch: string }>;
    };
    expect(request.jobs[0].branch).toBe("main");
  });

  it("returns one completed job per plan key, keyed for rebuilding the record", async () => {
    const { client, getJobStatusSpy } = recordingClient();

    const result = await executeBatch(client, {
      jobs: [deleteFileJob, deleteDocJob],
    });

    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.map((entry) => entry.key)).toEqual(["drive", "delete"]);
    expect(result.jobs[0].job).toMatchObject({
      id: "job-drive",
      documentId: "drive-1",
      status: "READ_READY",
      meta: { batchId: "batch-1", batchJobIds: ["job-drive"] },
    });
    expect(result.jobs[1].job).toMatchObject({
      id: "job-delete",
      status: "READ_READY",
    });
    expect(getJobStatusSpy).toHaveBeenCalledWith("job-drive");
    expect(getJobStatusSpy).toHaveBeenCalledWith("job-delete");
  });

  it("surfaces a batch failure with the partial-state caveat", async () => {
    const client = {
      executeBatch: vi
        .fn()
        .mockRejectedValue(new Error("drive refused the removal")),
      getJobStatus: vi.fn(),
    } as unknown as IReactorClient;

    const run = executeBatch(client, { jobs: [deleteFileJob] });

    await expect(run).rejects.toThrow("drive refused the removal");
    await expect(run).rejects.toThrow(/ordering-only, not atomic/);
    await expect(run).rejects.toThrow(
      /re-applies every job that already succeeded/,
    );
  });

  it("names the failed plan key and the partial-state caveat when a job comes back FAILED", async () => {
    const failed = {
      id: "job-delete",
      documentId: "file-1",
      status: "FAILED",
      createdAtUtcIso: "2026-01-01T00:00:00.000Z",
      error: { name: "Error", message: "delete rejected", stack: "" },
      consistencyToken: {
        version: 1,
        createdAtUtcIso: "2026-01-01T00:00:01.000Z",
        coordinates: [],
      },
      meta: { batchId: "batch-1", batchJobIds: ["job-delete"] },
    } as unknown as JobInfo;
    const client = {
      executeBatch: vi.fn().mockResolvedValue({
        jobs: {
          drive: { id: "job-drive", documentId: "drive-1", status: "PENDING" },
          delete: {
            id: "job-delete",
            documentId: "file-1",
            status: "PENDING",
          },
        },
      }),
      getJobStatus: vi
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(
            id === "job-delete" ? failed : completedJob("job-drive", "drive-1"),
          ),
        ),
    } as unknown as IReactorClient;

    const run = executeBatch(client, {
      jobs: [deleteFileJob, deleteDocJob],
    });

    await expect(run).rejects.toThrow(/Batch job "delete" failed/);
    await expect(run).rejects.toThrow("delete rejected");
    await expect(run).rejects.toThrow(/ordering-only, not atomic/);
    await expect(run).rejects.toThrow(
      /re-applies every job that already succeeded/,
    );
  });

  it("raises a diagnosable error naming a plan key missing from the reactor result", async () => {
    const client = {
      executeBatch: vi.fn().mockResolvedValue({
        jobs: {
          drive: { id: "job-drive", documentId: "drive-1", status: "PENDING" },
        },
      }),
      getJobStatus: vi.fn(),
    } as unknown as IReactorClient;

    const run = executeBatch(client, {
      jobs: [deleteFileJob, deleteDocJob],
    });

    await expect(run).rejects.toThrow(/missing plan key "delete"/);
    await expect(run).rejects.toThrow(/returned jobs for \[drive\]/);
  });
});

describe("the batch mutation surface", () => {
  const schema = buildSchema(SDL);
  const mutation = schema.getType("Mutation") as GraphQLObjectType;

  it("offers executeBatch", () => {
    expect(mutation.getFields().executeBatch).toBeDefined();
  });

  it("takes a list of ExecutionJobInput", () => {
    const arg = mutation
      .getFields()
      .executeBatch.args.find((a) => a.name === "jobs");
    expect(String(arg?.type)).toBe("[ExecutionJobInput!]!");
  });

  it("declares the job plan fields mirroring ExecutionJobPlan", () => {
    const input = schema.getType("ExecutionJobInput");
    const fields = (
      input as { getFields(): Record<string, unknown> }
    ).getFields();
    expect(Object.keys(fields).sort()).toEqual(
      [
        "actions",
        "branch",
        "dependsOn",
        "documentIdOrSlug",
        "key",
        "scope",
      ].sort(),
    );
  });
});
