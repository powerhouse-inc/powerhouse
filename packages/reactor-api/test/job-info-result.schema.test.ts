import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema, graphql } from "graphql";
import { describe, expect, it } from "vitest";
import { jobStatus } from "../src/graphql/reactor/resolvers.js";
import type { IReactorClient } from "@powerhousedao/reactor";

// Executed against the real SDL: what this covers is the schema's own
// nullability, which a resolver called directly cannot exercise.
const SDL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../src/graphql/reactor/schema.graphql",
  ),
  "utf8",
);

const QUERY = `
  query Status($jobId: String!) {
    jobStatus(jobId: $jobId) {
      id
      status
      result
      error
      createdAt
      completedAt
    }
  }
`;

/** A job as the tracker holds one that has not produced anything yet. */
const pendingJob = {
  id: "job-1",
  documentId: "doc-1",
  status: "PENDING",
  createdAtUtcIso: "2026-01-01T00:00:00.000Z",
  consistencyToken: {
    version: 1,
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    coordinates: [],
  },
  meta: { batchId: "batch-1", batchJobIds: ["job-1"] },
};

function clientReturning(job: unknown): IReactorClient {
  return {
    getJobStatus: () => Promise.resolve(job),
  } as unknown as IReactorClient;
}

const ask = (job: unknown, source = QUERY, serves = true) =>
  graphql({
    schema: buildSchema(SDL),
    source,
    variableValues: { jobId: "job-1" },
    rootValue: {
      jobStatus: (args: { jobId: string }) =>
        jobStatus(clientReturning(job), args, () => Promise.resolve(serves)),
    },
  });

describe("asking for a job that has not finished", () => {
  it("answers, rather than failing on a field it has no value for", async () => {
    // A job carries no result until it produces one, so a non-null `result`
    // made every pending job unserveable - the same shape of failure as an
    // operation the schema cannot represent, one query over.
    const result = await ask(pendingJob);

    expect(result.errors).toBeUndefined();
    const data = result.data as {
      jobStatus: { status: string; result: unknown };
    };
    expect(data.jobStatus.status).toBe("PENDING");
    expect(data.jobStatus.result).toBeNull();
  });

  it("still carries a result once there is one", async () => {
    const result = await ask({
      ...pendingJob,
      status: "READ_READY",
      result: { revision: 3 },
      completedAtUtcIso: "2026-01-01T00:00:01.000Z",
    });

    expect(result.errors).toBeUndefined();
    const data = result.data as { jobStatus: { result: unknown } };
    expect(data.jobStatus.result).toEqual({ revision: 3 });
  });
});

const FULL_QUERY = `
  query Status($jobId: String!) {
    jobStatus(jobId: $jobId) {
      id
      documentId
      status
      error
      errorName
      consistencyToken {
        version
        createdAtUtcIso
        coordinates {
          documentId
          scope
          branch
          operationIndex
        }
      }
      meta {
        batchId
        batchJobIds
      }
    }
  }
`;

describe("what a job carries over the wire", () => {
  it("names its document, error class, consistency token and batch", async () => {
    const result = await ask(
      {
        ...pendingJob,
        status: "FAILED",
        completedAtUtcIso: "2026-01-01T00:00:01.000Z",
        error: {
          name: "UpgradePreconditionFailedError",
          message: "revision moved",
          stack: "at secret (server.ts:1)",
        },
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2026-01-01T00:00:01.000Z",
          coordinates: [
            {
              documentId: "doc-1",
              scope: "global",
              branch: "main",
              operationIndex: 4,
            },
          ],
        },
        meta: { batchId: "batch-1", batchJobIds: ["job-1"], caller: "x" },
      },
      FULL_QUERY,
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      jobStatus: {
        id: "job-1",
        documentId: "doc-1",
        status: "FAILED",
        error: "revision moved",
        errorName: "UpgradePreconditionFailedError",
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2026-01-01T00:00:01.000Z",
          coordinates: [
            {
              documentId: "doc-1",
              scope: "global",
              branch: "main",
              operationIndex: 4,
            },
          ],
        },
        meta: { batchId: "batch-1", batchJobIds: ["job-1"] },
      },
    });
  });

  it("answers an unserved job with the reactor's unknown-job shape", async () => {
    const result = await ask(pendingJob, FULL_QUERY, false);

    expect(result.errors).toBeUndefined();
    const data = result.data as {
      jobStatus: { documentId: string; status: string; error: string };
    };
    expect(data.jobStatus.documentId).toBe("");
    expect(data.jobStatus.status).toBe("FAILED");
    expect(data.jobStatus.error).toBe("Job not found");
  });
});
