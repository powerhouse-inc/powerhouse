import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFilter,
} from "@powerhousedao/shared/processors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessorManager } from "../../../src/processors/processor-manager.js";
import {
  createTestDatabase,
  legacyDrive,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "../executor/harness.js";

const DOC_TYPE = "powerhouse/document-model";

type Recorder = IProcessor & { events: string[] };

function recorder(): Recorder {
  const processor: Recorder = {
    events: [],
    onOperations(ops: OperationWithContext[]) {
      for (const op of ops) {
        processor.events.push(
          `${op.operation.action.type} ${op.context.documentId}`,
        );
      }
      return Promise.resolve();
    },
    onDisconnect() {
      processor.events.push("disconnect");
      return Promise.resolve();
    },
  };
  return processor;
}

const hungProcessor = () => {
  const state = { reached: false };
  const processor: IProcessor = {
    onOperations: () => {
      state.reached = true;
      return new Promise(() => undefined);
    },
    onDisconnect: () => Promise.resolve(),
  };
  return { processor, state };
};

type QueueOptions = {
  purged: (ids: string[]) => Promise<ReadonlySet<string>>;
  lookupRetryMs?: number;
  lookupRetries?: number;
};

const within = <T>(p: Promise<T>, ms: number) =>
  Promise.race([
    p.then(() => "resolved"),
    new Promise((resolve) => setTimeout(() => resolve("pending"), ms)),
  ]);

describe("processor registration robustness [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;

  beforeEach(async () => {
    database = await createTestDatabase("reactor_registration_robustness");
    host = await startReactor(database);
  });

  afterEach(async () => {
    try {
      await host?.kill();
    } finally {
      await database?.drop();
    }
  });

  const manager = () => host.module.processorManager as ProcessorManager;
  const filter: ProcessorFilter = { documentType: [DOC_TYPE] };

  async function createDrive(slug?: string): Promise<string> {
    const drive = legacyDrive();
    if (slug) drive.header.slug = slug;
    await succeeded(host.reactor, (await host.reactor.create(drive)).id);
    return drive.header.id;
  }

  async function deleteDrive(driveId: string) {
    await succeeded(
      host.reactor,
      (await host.reactor.deleteDocument(driveId)).id,
    );
  }

  // A registration whose owed deletion of `driveId` hangs in the processor.
  async function hangOwedDeletion() {
    const driveId = await createDrive();
    await manager().registerFactory("pkg", (h) =>
      h.id === driveId ? [{ processor: recorder(), filter }] : [],
    );
    await manager().unregisterFactory("pkg");
    await deleteDrive(driveId);

    const { processor, state } = hungProcessor();
    await manager().registerFactory("pkg", (h) =>
      Promise.resolve(h.id === driveId ? [{ processor, filter }] : []),
    );
    await vi.waitFor(() => expect(state.reached).toBe(true));
    return driveId;
  }

  describe("a hung owed deletion", () => {
    it("does not hold the next unregistration", async () => {
      await hangOwedDeletion();

      expect(await within(manager().unregisterFactory("pkg"), 3_000)).toBe(
        "resolved",
      );
    }, 30_000);

    it("does not hold a re-registration, whose processors run", async () => {
      const live = await createDrive();
      await hangOwedDeletion();

      const fresh = recorder();
      const reload = manager().registerFactory("pkg", (h) =>
        Promise.resolve(
          h.id === live
            ? [{ processor: fresh, filter: { documentId: ["*"] } }]
            : [],
        ),
      );
      expect(await within(reload, 3_000)).toBe("resolved");

      const next = await createDrive();
      await vi.waitFor(() =>
        expect(fresh.events).toContain(`CREATE_DOCUMENT ${next}`),
      );
      expect(
        manager()
          .getAll()
          .map((t) => t.driveId),
      ).toEqual([live]);
    }, 30_000);
  });

  it("leaves a processor parked by a lookup outage active across a restart", async () => {
    const driveId = await createDrive();
    const factory = (processor: IProcessor) => (h: { id: string }) =>
      Promise.resolve(
        h.id === driveId ? [{ processor, filter: { documentId: ["*"] } }] : [],
      );
    await manager().registerFactory("pkg", factory(recorder()));
    const internals = manager() as unknown as {
      processorsByDrive: Map<string, { queue: { options: QueueOptions } }[]>;
      checkPurged: unknown;
    };
    const { options } = internals.processorsByDrive.get(driveId)![0]!.queue;
    options.lookupRetryMs = 1;
    options.lookupRetries = 3;
    options.purged = () => Promise.reject(new Error("db down"));
    internals.checkPurged = () => {
      const purged = Promise.reject(new Error("db down"));
      purged.catch(() => undefined);
      return { purged };
    };
    const tracked = () =>
      manager()
        .getAll()
        .find((t) => t.driveId === driveId);

    const other = await createDrive();
    await vi.waitFor(() => expect(tracked()?.lastError).toBe("db down"), {
      timeout: 10_000,
    });
    // A long failover: the reactor restarts before the lookup answers again.
    await host.kill();
    host = await startReactor(database);
    const after = recorder();
    await manager().registerFactory("pkg", factory(after));

    await vi.waitFor(() =>
      expect(after.events).toContain(`CREATE_DOCUMENT ${other}`),
    );
    expect(tracked()).toMatchObject({ status: "active", lastError: undefined });
  }, 30_000);

  it("does not deliver a live deletion twice across a re-registration", async () => {
    const driveId = await createDrive();
    const release = { resolve: () => undefined as void };
    const deleting = new Promise<void>((resolve) => {
      release.resolve = resolve;
    });
    const first: Recorder = recorder();
    const slow: IProcessor = {
      async onOperations(ops) {
        await first.onOperations(ops);
        if (ops.some((op) => op.operation.action.type === "DELETE_DOCUMENT")) {
          await deleting;
        }
      },
      onDisconnect: () => first.onDisconnect(),
    };
    await manager().registerFactory("pkg", (h) =>
      h.id === driveId ? [{ processor: slow, filter }] : [],
    );
    await deleteDrive(driveId);
    await vi.waitFor(() =>
      expect(first.events).toContain(`DELETE_DOCUMENT ${driveId}`),
    );

    const second = recorder();
    const reload = manager().registerFactory("pkg", (h) =>
      h.id === driveId ? [{ processor: second, filter }] : [],
    );
    expect(await within(reload, 3_000)).toBe("resolved");
    await new Promise((resolve) => setTimeout(resolve, 500));
    release.resolve();

    await vi.waitFor(() => expect(first.events).toContain("disconnect"));
    expect(second.events).toEqual([]);
  }, 30_000);
});
