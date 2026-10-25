import {
  actions,
  type OperationWithContext,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDocumentAction } from "../../src/actions/index.js";
import { JobFailedError } from "../../src/client/internal/handles.js";
import { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import type {
  IReadModel,
  IReadModelReservation,
} from "../../src/read-models/interfaces.js";
import { JobAwaiter } from "../../src/shared/awaiter.js";
import { BatchJobFailedError } from "../../src/shared/errors.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import type { InProcessReactorClientModule } from "../../src/core/types.js";
import {
  createDocModelDocument,
  createEmptyConsistencyToken,
  createMockDocumentIndexer,
  createMockDocumentView,
  createMockJobAwaiter,
  createMockLogger,
  createMockSigner,
  createMockSubscriptionManager,
} from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

/** A gate a test opens; until then, whatever waits on it waits. */
class Gate {
  armed = false;
  private opened: Promise<void> = Promise.resolve();
  private openIt: () => void = () => {};

  arm(): void {
    this.armed = true;
    this.opened = new Promise((resolve) => {
      this.openIt = resolve;
    });
  }

  open(): void {
    this.armed = false;
    this.openIt();
  }

  async pass(): Promise<void> {
    if (this.armed) {
      await this.opened;
    }
  }
}

/** A pre-ready read model that holds READ_READY back while its gate is armed. */
class GatedReadModel implements IReadModel {
  readonly name = "gated-read-model";

  constructor(private readonly gate: Gate) {}

  async indexOperations(_operations: OperationWithContext[]): Promise<void> {
    await this.gate.pass();
  }
}

function settledFlag(promise: Promise<unknown>): { settled: boolean } {
  const flag = { settled: false };
  promise.then(
    () => {
      flag.settled = true;
    },
    () => {
      flag.settled = true;
    },
  );
  return flag;
}

function pendingJob(id: string, documentId: string): JobInfo {
  return {
    id,
    documentId,
    status: JobStatus.PENDING,
    createdAtUtcIso: new Date().toISOString(),
    consistencyToken: createEmptyConsistencyToken(),
    meta: { batchId: "test", batchJobIds: [id] },
  };
}

describe("write handles over a real reactor", () => {
  let module: InProcessReactorClientModule;
  let reactor: IReactor;
  let gate: Gate;

  beforeEach(async () => {
    gate = new Gate();
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([documentModelDocumentModelModule])
          .withReadModel(new GatedReadModel(gate)),
      )
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    reactor = module.reactor;
  });

  afterEach(() => {
    gate.open();
    reactor.kill();
  });

  it("resolves at acceptance, settles written before readable, and reads back with the token", async () => {
    const created = createDocModelDocument({ id: "handle-doc-1" });
    await module.client.create(created);

    gate.arm();
    const handle = await module.client.write.execute("handle-doc-1", "main", [
      actions.setName("renamed"),
    ]);
    expect(handle.jobId).toBeTruthy();
    expect(handle.documentId).toBe("handle-doc-1");
    expect(handle.branch).toBe("main");

    const readable = settledFlag(handle.readable);
    const written = await handle.written;
    expect(written.job.status).toBe(JobStatus.WRITE_READY);
    expect(written.token.coordinates.length).toBeGreaterThan(0);
    expect(written.documentId).toBe("handle-doc-1");

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(readable.settled).toBe(false);

    gate.open();
    const receipt = await handle.readable;
    expect(receipt.job.status).toBe(JobStatus.READ_READY);
    expect(receipt.token).toEqual(written.token);

    const document = await handle.document();
    expect(document.header.name).toBe("renamed");
  });

  it("hands back a create handle whose document is the new one", async () => {
    const created = createDocModelDocument({ id: "handle-doc-2" });

    const handle = await module.client.write.create(created);
    expect(handle.documentId).toBe("handle-doc-2");

    const document = await handle.document();
    expect(document.header.id).toBe("handle-doc-2");
  });

  it("settles a batch per key and over the whole batch", async () => {
    await module.client.create(createDocModelDocument({ id: "batch-doc-1" }));

    const batch = await module.client.write.executeBatch({
      jobs: [
        {
          key: "rename",
          documentId: "batch-doc-1",
          scope: "global",
          branch: "main",
          actions: [actions.setName("first")],
          dependsOn: [],
        },
      ],
    });

    expect(Object.keys(batch.handles)).toEqual(["rename"]);
    expect(batch.jobs.rename.id).toBe(batch.handles.rename.jobId);
    const receipts = await batch.readable;
    expect(receipts.rename.job.status).toBe(JobStatus.READ_READY);
    const renamed = await batch.handles.rename.document();
    expect(renamed.header.name).toBe("first");
  });

  it("serves a token-bounded read on a second client instance", async () => {
    await module.client.create(createDocModelDocument({ id: "token-doc" }));

    // A second client over the same store, as a read served elsewhere would be.
    const second = new ReactorClient(
      createMockLogger(),
      module.reactor,
      module.signer,
      module.subscriptionManager,
      module.jobAwaiter,
      module.documentIndexer,
      module.documentView,
    );

    // Hold the document view back, so the write is in the log but not readable.
    const view = module.documentView as unknown as IReadModel;
    const reserve = view.reserveOperations!.bind(view);
    const viewGate = new Gate();
    vi.spyOn(view, "reserveOperations").mockImplementation((operations) => {
      const reservation: IReadModelReservation = reserve(operations);
      return {
        apply: async () => {
          await viewGate.pass();
          return reservation.apply();
        },
        release: () => reservation.release(),
      };
    });

    viewGate.arm();
    const handle = await module.client.write.execute("token-doc", "main", [
      actions.setName("seen-through-token"),
    ]);
    const { token } = await handle.written;

    const unbounded = await second.read.get<PHDocument>("token-doc");
    expect(unbounded.header.name).not.toBe("seen-through-token");

    const bounded = second.read.get<PHDocument>(
      "token-doc",
      undefined,
      undefined,
      token,
    );
    const boundedFlag = settledFlag(bounded);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(boundedFlag.settled).toBe(false);

    viewGate.open();
    expect((await bounded).header.name).toBe("seen-through-token");
  });

  it("rejects a batch stage with BatchJobFailedError naming the failed key", async () => {
    const existing = createDocModelDocument({ id: "batch-fail-doc" });
    await module.client.create(existing);
    const { header } = existing;

    const batch = await module.client.write.executeBatch({
      jobs: [
        {
          key: "duplicate",
          documentId: header.id,
          scope: "document",
          branch: "main",
          actions: [
            createDocumentAction({
              model: header.documentType,
              version: 0,
              documentId: header.id,
              signing: {
                signature: header.id,
                publicKey: header.sig.publicKey,
                nonce: header.sig.nonce,
                createdAtUtcIso: header.createdAtUtcIso,
                documentType: header.documentType,
              },
            }),
          ],
          dependsOn: [],
        },
      ],
    });

    const thrown = await batch.readable.catch((error: unknown) => error);
    expect(BatchJobFailedError.isError(thrown)).toBe(true);
    expect((thrown as BatchJobFailedError).key).toBe("duplicate");
    await expect(batch.handles.duplicate.readable).rejects.toBeInstanceOf(
      JobFailedError,
    );
  });
});

describe("write handle stages", () => {
  function clientWith(jobAwaiter = createMockJobAwaiter()) {
    const reactor = {
      execute: vi.fn().mockResolvedValue(pendingJob("job-1", "doc-1")),
      getByIdOrSlug: vi.fn(),
    } as unknown as IReactor;
    const documentView = createMockDocumentView();
    vi.mocked(documentView.resolveSlug).mockResolvedValue(undefined);
    const client = new ReactorClient(
      createMockLogger(),
      reactor,
      createMockSigner(),
      createMockSubscriptionManager(),
      jobAwaiter,
      createMockDocumentIndexer(),
      documentView,
    );
    return { client, reactor, jobAwaiter };
  }

  it("rejects both stages with JobFailedError carrying the FAILED job", async () => {
    const failed: JobInfo = {
      ...pendingJob("job-1", "doc-1"),
      status: JobStatus.FAILED,
      error: { name: "Error", message: "boom", stack: "" },
    };
    const { client, reactor } = clientWith(
      createMockJobAwaiter({
        waitForJob: vi.fn().mockResolvedValue(failed),
      }),
    );

    const handle = await client.write.execute("doc-1", "main", []);

    const readable = await handle.readable.catch((error: unknown) => error);
    expect(readable).toBeInstanceOf(JobFailedError);
    expect((readable as JobFailedError).job).toBe(failed);
    expect((readable as JobFailedError).message).toBe("boom");

    const written = await handle.written.catch((error: unknown) => error);
    expect(written).toBeInstanceOf(JobFailedError);

    await expect(handle.document()).rejects.toBeInstanceOf(JobFailedError);
    expect(reactor.getByIdOrSlug).not.toHaveBeenCalled();
  });

  it("waits for nothing when no stage is touched", async () => {
    const { client, jobAwaiter } = clientWith();

    const handle = await client.write.execute("doc-1", "main", []);

    expect(handle.jobId).toBe("job-1");
    expect(jobAwaiter.waitForJob).not.toHaveBeenCalled();
  });

  it("waits for written through the awaiter's stage wait when it has one", async () => {
    const written: JobInfo = {
      ...pendingJob("job-1", "doc-1"),
      status: JobStatus.WRITE_READY,
    };
    const waitForStage = vi.fn().mockResolvedValue(written);
    const { client, jobAwaiter } = clientWith(
      Object.assign(createMockJobAwaiter(), { waitForStage }),
    );

    const handle = await client.write.execute("doc-1", "main", []);
    const receipt = await handle.written;

    expect(receipt.job).toBe(written);
    expect(waitForStage).toHaveBeenCalledWith("job-1", "written", undefined);
    expect(jobAwaiter.waitForJob).not.toHaveBeenCalled();
  });
});

describe("JobAwaiter.waitForStage", () => {
  it("settles written at WRITE_READY and readable only at READ_READY", async () => {
    const eventBus = new EventBus();
    let status = JobStatus.RUNNING;
    const awaiter = new JobAwaiter(eventBus, (jobId) =>
      Promise.resolve({ ...pendingJob(jobId, "doc-1"), status }),
    );

    const written = awaiter.waitForStage("job-1", "written");
    const readable = awaiter.waitForStage("job-1", "readable");
    const readableFlag = settledFlag(readable);
    await new Promise((resolve) => setTimeout(resolve, 0));

    status = JobStatus.WRITE_READY;
    await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-1",
    } as never);

    expect((await written).status).toBe(JobStatus.WRITE_READY);
    expect(readableFlag.settled).toBe(false);

    status = JobStatus.READ_READY;
    await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
      jobId: "job-1",
    } as never);

    expect((await readable).status).toBe(JobStatus.READ_READY);
    awaiter.shutdown();
  });

  it("settles both stages on FAILED and keeps waitForJob as the readable stage", async () => {
    const eventBus = new EventBus();
    let status = JobStatus.RUNNING;
    const awaiter = new JobAwaiter(eventBus, (jobId) =>
      Promise.resolve({ ...pendingJob(jobId, "doc-1"), status }),
    );

    const written = awaiter.waitForStage("job-2", "written");
    const job = awaiter.waitForJob("job-2");
    await new Promise((resolve) => setTimeout(resolve, 0));

    status = JobStatus.FAILED;
    await eventBus.emit(ReactorEventTypes.JOB_FAILED, {
      jobId: "job-2",
    } as never);

    expect((await written).status).toBe(JobStatus.FAILED);
    expect((await job).status).toBe(JobStatus.FAILED);
    awaiter.shutdown();
  });
});
