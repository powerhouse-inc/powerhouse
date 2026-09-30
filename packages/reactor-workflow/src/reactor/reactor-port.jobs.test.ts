import {
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkflowRuntimeHostDeps } from "./host.js";
import { SubgraphReactorPort } from "./reactor-port.js";

function portOver(client: unknown): SubgraphReactorPort {
  return new SubgraphReactorPort({
    reactorClient: client,
  } as unknown as WorkflowRuntimeHostDeps);
}

describe("SubgraphReactorPort.wait", () => {
  it("answers the job as it stands once the slice runs out", async () => {
    const port = portOver({
      waitForJob: (_id: string, signal: AbortSignal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () =>
            reject(new Error("Operation aborted")),
          ),
        ),
      getJobStatus: (id: string) =>
        Promise.resolve({ id, status: JobStatus.RUNNING }),
    });

    const started = Date.now();
    const state = await port.wait({ jobId: "j1", maxWaitMs: 50 });

    expect(state).toEqual({ jobId: "j1", status: "RUNNING" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("passes on a failure that was not the slice running out", async () => {
    const port = portOver({
      waitForJob: () => Promise.reject(new Error("JobAwaiter destroyed")),
      getJobStatus: () => Promise.reject(new Error("must not be asked")),
    });

    await expect(port.wait({ jobId: "j1", maxWaitMs: 1_000 })).rejects.toThrow(
      "JobAwaiter destroyed",
    );
  });
});

describe("SubgraphReactorPort against a reactor", () => {
  let module: InProcessReactorClientModule;
  let port: SubgraphReactorPort;
  const DOC = "doc-jobs";

  beforeAll(async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
    await module.client.create(
      withSignaturePolicy(
        documentModelDocumentModelModule.utils.createDocument(),
        "legacy",
        { id: DOC },
      ),
    );
    port = portOver(module.client);
  });

  afterAll(() => {
    module.reactor.kill();
  });

  it("reports each submitted action by the id submit answered with", async () => {
    const submission = await port.submit({
      documentId: DOC,
      actions: [
        { type: "SET_NAME", input: { name: "First" } },
        { type: "SET_NAME", input: { name: "Second" } },
      ],
    });

    let state = await port.wait({ jobId: submission.jobId, maxWaitMs: 5_000 });
    while (state.status !== "READ_READY" && state.status !== "FAILED") {
      state = await port.wait({ jobId: submission.jobId, maxWaitMs: 5_000 });
    }

    expect(state.status).toBe("READ_READY");
    expect(state.actions).toEqual(
      submission.actionIds.map((actionId) => ({ actionId, kind: "applied" })),
    );
    expect((await port.get({ documentId: DOC })).name).toBe("Second");
  });

  it("carries a reducer's rejection on the action it rejected", async () => {
    const submission = await port.submit({
      documentId: DOC,
      actions: [
        { type: "SET_NAME", input: { name: "Kept" } },
        { type: "SET_MODEL_NAME", input: { name: 42 } },
      ],
    });

    let state = await port.wait({ jobId: submission.jobId, maxWaitMs: 5_000 });
    while (state.status !== "READ_READY" && state.status !== "FAILED") {
      state = await port.wait({ jobId: submission.jobId, maxWaitMs: 5_000 });
    }

    expect(state.status).toBe("READ_READY");
    const [kept, rejected] = state.actions ?? [];
    expect(kept).toEqual({
      actionId: submission.actionIds[0],
      kind: "applied",
    });
    expect(rejected).toMatchObject({
      actionId: submission.actionIds[1],
      kind: "reducer-error",
    });
    expect(rejected.message).toBeTruthy();
  });

  it("calls a job the reactor has no record of unknown, not failed", async () => {
    expect(await port.wait({ jobId: "no-such-job", maxWaitMs: 100 })).toEqual({
      jobId: "no-such-job",
      status: "UNKNOWN",
    });
  });
});
