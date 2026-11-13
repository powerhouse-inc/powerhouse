import {
  authAddress,
  type ISigner,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  defineInitialAuthProvider,
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "../../index.js";
import type { Database } from "../../src/core/types.js";
import { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import { createTestOperationStorePostgres } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import { referenceNote } from "./reference-app.js";

describe("initial authorization across PostgreSQL connections", () => {
  let signer: ISigner;
  const hosts: InProcessReactorClientModule[] = [];
  const cleanups: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    signer = (await TestP256Signer.create()).asISigner([], {
      address: "administrator",
      networkId: "eip155",
      chainId: 1,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const host of hosts.splice(0)) await host.reactor.kill().completed;
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  async function build(existing?: Kysely<Database>, catchUpIntervalMs = 2000) {
    let database = existing;
    if (!database) {
      const storage = await createTestOperationStorePostgres();
      database = storage.baseDb as unknown as Kysely<Database>;
      cleanups.push(storage.cleanup);
    }
    const host = await new ReactorClientBuilder()
      .withSigner(signer)
      .withReactorBuilder(
        new ReactorBuilder()
          .withKysely(database)
          .withCatchUp({ intervalMs: catchUpIntervalMs })
          .withDocumentModelSources([referenceNote])
          .withExecutorConfig({
            signatureVerification: "enforce",
            featureFlags: {
              documentDecisions: true,
              authEnforcement: true,
              authGroups: true,
              authConditions: true,
            },
          })
          .withInitialAuth({
            providers: [
              defineInitialAuthProvider(referenceNote, {
                deployment: { administrator: authAddress("administrator") },
                authorizeCreation() {},
                resolveInstance: () => ({ owner: authAddress("owner") }),
              }),
            ],
            trustOrigin: () => true,
          }),
      )
      .buildModule();
    hosts.push(host);
    if (!host.reactorModule) throw new Error("Expected a local reactor");
    return { host, database, module: host.reactorModule };
  }

  it("withholds uncommitted state from public caches and other SQL connections, then rolls back and retries", async () => {
    const { host, module } = await build();
    const coordinator = module.initialAuth;
    if (!coordinator)
      throw new Error("Expected initial authorization configuration");
    const draft = referenceNote.utils.createDocument();
    const request = {
      requester: { address: "owner" },
      context: "rollback",
      idempotencyKey: "one",
    };
    const prepared = await coordinator.prepare(draft, request, signer);
    const id = prepared.document.header.id;
    const reachedInitializer = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const original = KyselyOperationStore.prototype.apply;
    const spy = vi
      .spyOn(KyselyOperationStore.prototype, "apply")
      .mockImplementation(async function (this: KyselyOperationStore, ...args) {
        const result = await original.apply(this, args);
        if (args[0] === id && args[2] === "auth") {
          reachedInitializer.resolve();
          await release.promise;
          throw new Error(
            "Injected failure after the private initializer append",
          );
        }
        return result;
      });
    const job = await host.reactor.execute(id, "main", prepared.actions);
    try {
      await reachedInitializer.promise;
      expect(
        (await module.operationStore.getSince(id, "document", "main", -1))
          .results,
      ).toEqual([]);
      expect(
        (await module.operationStore.getSince(id, "auth", "main", -1)).results,
      ).toEqual([]);
      await expect(
        module.writeCache.getState(id, "document", "main"),
      ).rejects.toThrow();
      await expect(host.read.get(id)).rejects.toThrow();
    } finally {
      release.resolve();
    }
    expect((await host.read.waitForJob(job.id)).status).toBe(JobStatus.FAILED);
    spy.mockRestore();
    expect(
      (await module.operationStore.getSince(id, "document", "main", -1))
        .results,
    ).toEqual([]);
    const retry = await host.write.createWithInitialAuth(draft, request);
    expect((await retry.readable).documentId).toBe(id);
    expect((await retry.document()).state.auth.version).toBe(1);
    expect((await retry.document()).state.auth.creator).toBeUndefined();
  }, 60_000);

  it("commits concurrent identical creation requests from two reactors exactly once", async () => {
    const first = await build();
    const second = await build(first.database);
    const draft = referenceNote.utils.createDocument();
    const request = {
      requester: { address: "owner" },
      context: "concurrent",
      idempotencyKey: "same-intent",
    };
    const handles = await Promise.all([
      first.host.write.createWithInitialAuth(draft, request),
      second.host.write.createWithInitialAuth(draft, request),
    ]);
    const receipts = await Promise.all(
      handles.map((handle) => handle.readable),
    );
    const id = receipts[0].documentId;
    expect(receipts[1].documentId).toBe(id);
    const operations = await first.host.reactor.getOperations(id);
    expect(
      operations.document.results.map((operation) => operation.action.type),
    ).toEqual(["CREATE_DOCUMENT", "UPGRADE_DOCUMENT"]);
    expect(
      operations.auth.results.map((operation) => operation.action.type),
    ).toEqual(["INITIALIZE_AUTH"]);
    expect((await first.host.reactor.getByIdOrSlug(id)).state.auth).toEqual(
      (await second.host.reactor.getByIdOrSlug(id)).state.auth,
    );
  }, 60_000);

  it("does not report a committed retry readable before its missing projection is recovered", async () => {
    const first = await build(undefined, 600_000);
    const second = await build(first.database, 600_000);
    first.module.readModelCoordinator.stop();
    const draft = referenceNote.utils.createDocument();
    const request = {
      requester: { address: "owner" },
      context: "projection-recovery",
      idempotencyKey: "committed-before-projection",
    };
    const original = await first.host.write.createWithInitialAuth(
      draft,
      request,
    );
    const written = await original.written;
    await expect(
      first.host.reactor.getByIdOrSlug(written.documentId),
    ).rejects.toThrow();
    const retry = await second.host.write.createWithInitialAuth(draft, request);
    const visibleAtReady = retry.readable.then(async (receipt) => {
      const document = await second.host.reactor.getByIdOrSlug(
        receipt.documentId,
      );
      expect(document.state.auth.version).toBe(1);
      expect(document.state.auth.creator).toBeUndefined();
    });
    try {
      const outcome = await Promise.race([
        visibleAtReady.then(() => "ready"),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 100),
        ),
      ]);
      if (outcome === "pending") await second.module.catchUp.sweepNow();
      await visibleAtReady;
    } finally {
      await second.module.catchUp.sweepNow();
    }
  }, 60_000);
});
