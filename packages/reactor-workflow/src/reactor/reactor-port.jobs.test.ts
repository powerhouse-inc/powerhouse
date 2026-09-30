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
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import type { ReactorExecuteInput } from "../pieces/index.js";
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
  async function settled(jobId: string) {
    let state = await port.wait({ jobId, maxWaitMs: 5_000 });
    while (state.status !== "READ_READY" && state.status !== "FAILED") {
      state = await port.wait({ jobId, maxWaitMs: 5_000 });
    }
    return state;
  }

  async function applied(followUp: ReactorExecuteInput) {
    const { jobId } = await port.submit(followUp);
    return settled(jobId);
  }

  let module: InProcessReactorClientModule;
  let port: SubgraphReactorPort;
  const DOC = "doc-jobs";

  beforeAll(async () => {
    // No signer here, so documents it creates stay unsigned.
    module = await new ReactorClientBuilder()
      .withCreateSignaturePolicy("legacy")
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule as unknown as DocumentModelModule,
          driveDocumentModelModule as unknown as DocumentModelModule,
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

  it("creates and names a document through its submission", async () => {
    const submission = await port.submitCreate({
      documentType: "powerhouse/document-model",
      name: "Invoice",
      parentId: DOC,
    });

    for (const jobId of submission.jobIds) {
      expect((await settled(jobId)).status).toBe("READ_READY");
    }
    for (const followUp of submission.followUps) {
      expect((await applied(followUp)).status).toBe("READ_READY");
    }
    const created = await port.get({ documentId: submission.documentId });
    expect(created).toMatchObject({
      documentType: "powerhouse/document-model",
      name: "Invoice",
    });
    const children = await module.client.getOutgoingRelationships(DOC, "child");
    expect(children.results.map((child) => child.header.id)).toContain(
      submission.documentId,
    );
  });

  it("files a created document into a drive once it exists", async () => {
    const drive = await module.client.drives.create({
      global: { name: "Drive", icon: null },
    });

    const submission = await port.submitCreate({
      documentType: "powerhouse/document-model",
      name: "Filed",
      parentId: drive.header.id,
    });
    for (const jobId of submission.jobIds) {
      expect((await settled(jobId)).status).toBe("READ_READY");
    }
    for (const followUp of submission.followUps) {
      const state = await applied(followUp);
      expect(state.actions?.map((action) => action.kind)).toEqual(["applied"]);
    }

    const filed = await port.get({ documentId: drive.header.id });
    expect(
      (filed.state as { nodes: { id: string; name: string }[] }).nodes,
    ).toContainEqual(
      expect.objectContaining({ id: submission.documentId, name: "Filed" }),
    );
  });
});
