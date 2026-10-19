import {
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type IReactorClient,
  type JobInfo,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  actions,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRoutingClient,
  fromReactorClient,
  type RoutableBackendConfig,
} from "../src/index.js";
import { fakeJob, IN_PROCESS, memoryInfo, silent } from "./stubs.js";

async function inProcessReactor(): Promise<InProcessReactorClientModule> {
  const builder = new ReactorBuilder().withDocumentModelSources([
    driveDocumentModelModule as unknown as DocumentModelModule,
    documentModelDocumentModelModule,
  ]);
  return new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .withCreateSignaturePolicy("legacy")
    .buildModule();
}

function config(name: string, client: IReactorClient): RoutableBackendConfig {
  return {
    name,
    backend: fromReactorClient(client),
    facts: memoryInfo(),
    reach: IN_PROCESS,
    refusesMisroutes: false,
  };
}

describe("a job the router did not submit", () => {
  let alpha: InProcessReactorClientModule;
  let beta: InProcessReactorClientModule;
  let job: JobInfo;
  let documentId = "";

  beforeAll(async () => {
    alpha = await inProcessReactor();
    beta = await inProcessReactor();
    const drive = await beta.client.drives.create({ global: { name: "Beta" } });
    documentId = drive.header.id;
    job = await beta.client.executeAsync(documentId, "main", [
      actions.setName("renamed on beta"),
    ]);
    await beta.client.waitForJob(job);
  });

  afterAll(async () => {
    await alpha.reactor.kill().completed;
    await beta.reactor.kill().completed;
  });

  it("is found on the reactor that ran it, with a cold job cache", async () => {
    const client = await createRoutingClient(
      [config("alpha", alpha.client), config("beta", beta.client)],
      { onDiagnostic: silent },
    );

    const status = await client.getJobStatus(job.id);

    expect(status.status).not.toBe(JobStatus.FAILED);
    expect(status.documentId).toBe(documentId);
    expect(client.describeRouting().jobs).toEqual([
      { jobId: job.id, backend: "beta" },
    ]);
  });

  it("is waited on at the reactor that ran it", async () => {
    const client = await createRoutingClient(
      [config("alpha", alpha.client), config("beta", beta.client)],
      { onDiagnostic: silent },
    );

    const done = await client.waitForJob(job.id);

    expect(done.status).toBe(JobStatus.READ_READY);
  });

  it("is reported unknown, by name, when no reactor ran it", async () => {
    const client = await createRoutingClient(
      [config("alpha", alpha.client), config("beta", beta.client)],
      { onDiagnostic: silent },
    );

    const status = await client.getJobStatus("no-such-job");

    expect(status.status).toBe(JobStatus.FAILED);
    expect(status.error?.name).toBe("JobNotFoundError");
  });
});

describe("a job behind a GraphQL-shaped client", () => {
  /** What reactor-api answers: unknown jobs by error name, real ones whole. */
  function graphqlShaped(jobs: Record<string, JobInfo>): IReactorClient {
    const answer = (jobId: string): JobInfo =>
      jobs[jobId] ?? {
        ...fakeJob(jobId, ""),
        status: JobStatus.FAILED,
        error: {
          name: "JobNotFoundError",
          message: "Job not found",
          stack: "",
        },
      };
    return {
      getJobStatus: (jobId: string) => Promise.resolve(answer(jobId)),
    } as unknown as IReactorClient;
  }

  it("reads the not-found answer as not here", async () => {
    const backend = fromReactorClient(graphqlShaped({}));

    await expect(backend.getJob("elsewhere")).resolves.toBeUndefined();
  });

  it("finds a remote job past a backend that does not know it", async () => {
    const remoteJob = fakeJob("remote-job", "remote-doc");
    const client = await createRoutingClient(
      [
        config("local", graphqlShaped({})),
        config("remote", graphqlShaped({ "remote-job": remoteJob })),
      ],
      { onDiagnostic: silent },
    );

    const status = await client.getJobStatus("remote-job");

    expect(status.documentId).toBe("remote-doc");
  });

  it("does not read an empty documentId as an unknown job", async () => {
    const client = await createRoutingClient(
      [
        config(
          "remote",
          graphqlShaped({ "blank-job": fakeJob("blank-job", "") }),
        ),
      ],
      { onDiagnostic: silent },
    );

    const status = await client.getJobStatus("blank-job");

    expect(status.id).toBe("blank-job");
    expect(status.status).not.toBe(JobStatus.FAILED);
  });
});
