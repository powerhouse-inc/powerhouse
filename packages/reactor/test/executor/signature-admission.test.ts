import type {
  Action,
  ActionSigner,
  ISigner,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addRelationshipAction,
  deleteDocumentAction,
} from "../../src/actions/index.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import {
  ReactorEventTypes,
  type SignatureRefusedEvent,
} from "../../src/events/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import type { Job } from "../../src/queue/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import type {
  SignatureTrustPolicy,
  SignatureVerificationMode,
} from "../../src/signer/types.js";
import { verifyActionSignature } from "../../src/signer/verify-action-signature.js";
import { createDocModelDocument } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const DOC_TYPE = "powerhouse/document-model";

describe("signature admission", () => {
  let module: InProcessReactorModule | undefined;
  let refusals: SignatureRefusedEvent[];
  let signer: TestP256Signer;
  let docId: string;
  let base: number;

  beforeAll(async () => {
    signer = await TestP256Signer.create();
  });

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build(
    signatureVerification?: SignatureVerificationMode,
    featureFlags: Partial<ReactorFeatureFlags> = {},
    options: {
      trustPolicy?: SignatureTrustPolicy;
      signer?: ISigner;
      jobTimeoutMs?: number;
    } = {},
  ): Promise<InProcessReactorModule> {
    const builder = new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({
        signatureVerification,
        featureFlags,
        ...(options.jobTimeoutMs ? { jobTimeoutMs: options.jobTimeoutMs } : {}),
      });
    if (options.trustPolicy) {
      builder.withTrustPolicy(options.trustPolicy);
    }
    if (options.signer) {
      builder.withSigner(options.signer);
    }
    module = await builder.buildModule();
    refusals = [];
    module.eventBus.subscribe(
      ReactorEventTypes.SIGNATURE_REFUSED,
      (_type: number, event: SignatureRefusedEvent) => {
        refusals.push(event);
      },
    );

    const document = createDocModelDocument();
    docId = document.header.id;
    expect((await settle(await module.reactor.create(document))).status).toBe(
      JobStatus.READ_READY,
    );
    base = Date.now() + 60_000;
    return module;
  }

  async function settle(job: JobInfo): Promise<JobInfo> {
    const reactor = module!.reactor;
    let status = await reactor.getJobStatus(job.id);
    while (
      status.status !== JobStatus.READ_READY &&
      status.status !== JobStatus.FAILED
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      status = await reactor.getJobStatus(job.id);
    }
    return status;
  }

  function at(offsetMs: number): string {
    return new Date(base + offsetMs).toISOString();
  }

  function moduleAction(id: string, offsetMs = 0): Action {
    return {
      ...addModule({ id, name: id }),
      timestampUtcMs: at(offsetMs),
    };
  }

  async function renownSigned(action: Action): Promise<Action> {
    return signer.signed(action, await signer.renownTuple(action));
  }

  async function v2Signed(action: Action, documentId = docId): Promise<Action> {
    return signer.signed(
      action,
      await signer.v2Tuple(action, { documentId, branch: "main" }),
    );
  }

  async function tampered(action: Action): Promise<Action> {
    const signed = await renownSigned(action);
    return { ...signed, input: { id: "tampered", name: "tampered" } };
  }

  async function badSignature(action: Action): Promise<Action> {
    const other = await TestP256Signer.create();
    const tuple = await other.renownTuple(action);
    return signer.signed(action, [
      tuple[0],
      signer.did,
      tuple[2],
      tuple[3],
      tuple[4],
    ]);
  }

  function asOperation(action: Action, index: number): Operation {
    return {
      id: deriveOperationId(docId, action.scope, "main", action.id),
      index,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };
  }

  async function execute(actions: Action[]): Promise<JobInfo> {
    return settle(await module!.reactor.execute(docId, "main", actions));
  }

  async function load(operations: Operation[]): Promise<JobInfo> {
    return settle(await module!.reactor.load(docId, "main", operations));
  }

  async function stored(scope = "global"): Promise<Operation[]> {
    const result = await module!.reactor.getOperations(docId, {
      branch: "main",
      scopes: [scope],
    });
    const byScope = result as Record<
      string,
      { results: Operation[] } | undefined
    >;
    return byScope[scope]?.results ?? [];
  }

  async function storedActionIds(): Promise<string[]> {
    return (await stored()).map((operation) => operation.action.id);
  }

  /** Writes past admission, as a store holding it from before this reactor. */
  async function storeDirectly(action: Action): Promise<void> {
    const store = module!.operationStore;
    const revisions = await store.getRevisions(docId, "main");
    const index =
      (revisions.revision as Record<string, number | undefined>).global ?? 0;
    await store.apply(docId, DOC_TYPE, "global", "main", index, (txn) => {
      txn.addOperations(asOperation(action, index));
    });
    module!.writeCache.invalidate(docId, "global", "main");
  }

  describe("at mutation admission", () => {
    it("accepts renown and shared legacy tuples", async () => {
      await build("enforce");
      const renown = await renownSigned(moduleAction("renown"));
      const shared = moduleAction("shared");
      const sharedSigned = signer.signed(
        shared,
        await signer.sharedTuple(shared, docId),
      );

      expect((await execute([renown, sharedSigned])).status).toBe(
        JobStatus.READ_READY,
      );
      expect(refusals).toEqual([]);
    });

    it.each(["renown", "shared"] as const)(
      "refuses a %s tuple over tampered input, with the code in JobInfo.error",
      async (scheme) => {
        await build("enforce");
        const action = moduleAction("m");
        const tuple =
          scheme === "renown"
            ? await signer.renownTuple(action)
            : await signer.sharedTuple(action, docId);
        const forged = signer.signed(
          { ...action, input: { id: "x", name: "x" } },
          tuple,
        );

        const job = await execute([forged]);

        expect(job.status).toBe(JobStatus.FAILED);
        expect(job.error?.name).toBe("InvalidSignatureError");
        expect(job.error?.message).toContain("[HASH_MISMATCH]");
        expect(await stored()).toEqual([]);
        expect(refusals).toMatchObject([
          { code: "HASH_MISMATCH", path: "mutation", enforced: true },
        ]);
      },
    );

    it("refuses a legacy tuple whose hash has another length", async () => {
      await build("enforce");
      const action = moduleAction("m");
      const job = await execute([
        signer.signed(action, await signer.tupleOver("h".repeat(30))),
      ]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[MALFORMED_TUPLE]");
    });

    it("accepts a v2 tuple, and a two-action v2 batch", async () => {
      await build("enforce");
      const job = await execute([
        await v2Signed(moduleAction("a", 0)),
        await v2Signed(moduleAction("b", 1)),
      ]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(refusals).toEqual([]);
    });

    it("accepts a v2 tuple appended to a head the signer never saw", async () => {
      await build("enforce");
      const first = await v2Signed(moduleAction("first", 0));
      expect((await execute([first])).status).toBe(JobStatus.READ_READY);

      const stale = moduleAction("stale", 1);
      const tuple = await signer.v2Tuple(
        stale,
        { documentId: docId, branch: "main" },
        signer.user,
        "state-before-first",
      );
      const job = await execute([signer.signed(stale, tuple)]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(await storedActionIds()).toEqual([first.id, stale.id]);
    });

    it("refuses a v2 tuple signed for another document", async () => {
      await build("enforce");
      const job = await execute([
        await v2Signed(moduleAction("m"), "doc-elsewhere"),
      ]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.name).toBe("InvalidSignatureError");
      expect(job.error?.message).toContain("[HASH_MISMATCH]");
      expect(await stored()).toEqual([]);
    });

    it("verifies ADD_RELATIONSHIP against the document it is written to", async () => {
      await build("enforce");
      const other = createDocModelDocument();
      expect((await settle(await module!.reactor.create(other))).status).toBe(
        JobStatus.READ_READY,
      );
      const relationship = {
        ...addRelationshipAction(other.header.id, docId, "child"),
        timestampUtcMs: at(0),
      };

      const signedForJob = await v2Signed(relationship, docId);
      const refused = await settle(
        await module!.reactor.execute(docId, "main", [signedForJob]),
      );
      expect(refused.status).toBe(JobStatus.FAILED);
      expect(refused.error?.message).toContain("[HASH_MISMATCH]");

      const signedForSource = await v2Signed(relationship, other.header.id);
      const accepted = await settle(
        await module!.reactor.execute(docId, "main", [signedForSource]),
      );
      expect(accepted.status).toBe(JobStatus.READ_READY);
      expect(refusals).toMatchObject([
        { documentId: other.header.id, code: "HASH_MISMATCH" },
      ]);
    });

    it("stores a multi-key input that still verifies once read back", async () => {
      await build("enforce");
      const action: Action = {
        ...moduleAction("m"),
        input: { name: "m", id: "m", z: { y: [1, { b: 2, a: 1 }], x: null } },
      };
      expect((await execute([await v2Signed(action)])).status).toBe(
        JobStatus.READ_READY,
      );

      const [operation] = await stored();
      expect(operation.action.id).toBe(action.id);
      expect(
        await verifyActionSignature(
          operation.action,
          { documentId: docId, branch: "main" },
          "load",
          operation,
        ),
      ).toEqual({ ok: true, scheme: "v2" });
    });

    it("treats a PassthroughSigner tuple as unsigned", async () => {
      await build("enforce");
      const action: Action = {
        ...moduleAction("m"),
        context: {
          signer: {
            user: { address: "", networkId: "", chainId: 0 },
            app: { name: "", key: "" },
            signatures: [["", "", "", "", ""]],
          },
        },
      };

      expect((await execute([action])).status).toBe(JobStatus.READ_READY);
      expect(refusals).toEqual([]);
    });

    it("fails on the first refusal and stores nothing", async () => {
      await build("enforce");
      const job = await execute([
        await renownSigned(moduleAction("a", 0)),
        await tampered(moduleAction("b", 1)),
        await renownSigned(moduleAction("c", 2)),
      ]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.name).toBe("InvalidSignatureError");
      expect(await stored()).toEqual([]);
    });

    it("refuses an action id already in the stream", async () => {
      await build("enforce");
      const action = await renownSigned(moduleAction("m"));
      expect((await execute([action])).status).toBe(JobStatus.READ_READY);

      const again = await execute([action]);

      expect(again.status).toBe(JobStatus.FAILED);
      expect(again.error?.message).toContain("[DUPLICATE_ACTION]");
      expect(await storedActionIds()).toEqual([action.id]);
    });

    it("enforces by default", async () => {
      await build();
      const job = await execute([await tampered(moduleAction("m"))]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[HASH_MISMATCH]");
    });

    it("logs and counts, but admits, in log mode", async () => {
      await build("log");
      const action = await tampered(moduleAction("m"));

      expect((await execute([action])).status).toBe(JobStatus.READ_READY);
      expect(await storedActionIds()).toEqual([action.id]);
      expect(refusals).toMatchObject([
        {
          code: "HASH_MISMATCH",
          scheme: "legacy-renown",
          path: "mutation",
          enforced: false,
          documentId: docId,
          actionId: action.id,
        },
      ]);
    });
  });

  describe("at load admission", () => {
    it("drops only the refused operation and succeeds with the rest", async () => {
      await build("enforce");
      const good1 = await renownSigned(moduleAction("a", 0));
      const bad = await badSignature(moduleAction("b", 1));
      const good2 = await renownSigned(moduleAction("c", 2));

      const job = await load([
        asOperation(good1, 0),
        asOperation(bad, 1),
        asOperation(good2, 2),
      ]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(await storedActionIds()).toEqual([good1.id, good2.id]);
      expect(refusals).toMatchObject([
        { actionId: bad.id, code: "BAD_SIGNATURE", path: "load" },
      ]);
    });

    it("succeeds with nothing stored when every operation is refused", async () => {
      await build("enforce");
      const bad = await badSignature(moduleAction("b"));

      const job = await load([asOperation(bad, 0)]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(await stored()).toEqual([]);
    });

    it("keeps a dropped operation's timestamp out of the reshuffle", async () => {
      await build("enforce");
      const local = await renownSigned(moduleAction("local", 10));
      expect((await execute([local])).status).toBe(JobStatus.READ_READY);

      const early = await badSignature(moduleAction("early", 0));
      const late = await renownSigned(moduleAction("late", 20));
      const job = await load([asOperation(early, 0), asOperation(late, 1)]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(
        (await stored()).map((operation) => [
          operation.action.id,
          operation.index,
        ]),
      ).toEqual([
        [local.id, 0],
        [late.id, 1],
      ]);
    });

    it("refuses a v2 operation stamped later than its action", async () => {
      await build("enforce");
      const action = await v2Signed(moduleAction("m", 0));
      const job = await load([
        { ...asOperation(action, 0), timestampUtcMs: at(5_000) },
      ]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(await stored()).toEqual([]);
      expect(refusals).toMatchObject([
        { actionId: action.id, code: "TIMESTAMP_MISMATCH", path: "load" },
      ]);
    });

    it("refuses a v2 operation replayed onto another document", async () => {
      await build("enforce");
      const action = await v2Signed(moduleAction("m", 0), "doc-elsewhere");

      expect((await load([asOperation(action, 0)])).status).toBe(
        JobStatus.READ_READY,
      );
      expect(await stored()).toEqual([]);
      expect(refusals).toMatchObject([{ code: "HASH_MISMATCH", path: "load" }]);
    });

    it("accepts a legacy operation whose input keys a store reordered", async () => {
      await build("enforce");
      const action: Action = {
        ...moduleAction("m"),
        input: { id: "m", name: "m" },
      };
      const signed = await renownSigned(action);
      const reordered = { ...signed, input: { name: "m", id: "m" } };

      const job = await load([asOperation(reordered, 0)]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(await storedActionIds()).toEqual([action.id]);
    });

    it("dedups a re-delivery silently and refuses a replay stamped later", async () => {
      await build("enforce");
      const action = await renownSigned(moduleAction("m", 0));
      expect((await load([asOperation(action, 0)])).status).toBe(
        JobStatus.READ_READY,
      );

      expect((await load([asOperation(action, 0)])).status).toBe(
        JobStatus.READ_READY,
      );
      expect(refusals).toEqual([]);

      const replay = { ...asOperation(action, 1), timestampUtcMs: at(5_000) };
      expect((await load([replay])).status).toBe(JobStatus.READ_READY);

      expect(await storedActionIds()).toEqual([action.id]);
      expect(refusals).toMatchObject([
        { actionId: action.id, code: "DUPLICATE_ACTION", path: "load" },
      ]);
    });
  });

  describe("a retried mutation", () => {
    /** Re-runs a job as the queue does after losing its first attempt. */
    async function retried(actions: Action[]): Promise<JobInfo> {
      const createdAtUtcIso = new Date().toISOString();
      const job: Job = {
        id: `retry-${actions[0].id}`,
        kind: "mutation",
        documentId: docId,
        scope: "global",
        branch: "main",
        actions,
        operations: [],
        createdAt: createdAtUtcIso,
        queueHint: [],
        maxRetries: 3,
        retryCount: 1,
        errorHistory: [
          { name: "WorkerExitedError", message: "worker exited", stack: "" },
        ],
        meta: { batchId: "retry", batchJobIds: [`retry-${actions[0].id}`] },
      };
      const info: JobInfo = {
        id: job.id,
        documentId: docId,
        status: JobStatus.PENDING,
        createdAtUtcIso,
        consistencyToken: { version: 1, createdAtUtcIso, coordinates: [] },
        meta: job.meta,
      };
      module!.jobTracker.registerJob(info);
      await module!.queue.enqueue(job);
      return settle(info);
    }

    it("succeeds without a second write when the first attempt committed", async () => {
      await build("enforce");
      const first = await v2Signed(moduleAction("a", 0));
      const second = await v2Signed(moduleAction("b", 1));
      expect((await execute([first, second])).status).toBe(
        JobStatus.READ_READY,
      );

      const job = await retried([first, second]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(await storedActionIds()).toEqual([first.id, second.id]);
      expect(refusals).toEqual([]);
    });

    it("refuses a retry whose action id holds other content", async () => {
      await build("enforce");
      const stored = await v2Signed(moduleAction("a", 0));
      expect((await execute([stored])).status).toBe(JobStatus.READ_READY);

      const changed = await v2Signed({
        ...moduleAction("a", 0),
        id: stored.id,
        input: { id: "a", name: "changed" },
      });
      const job = await retried([changed]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[DUPLICATE_ACTION]");
      expect(await storedActionIds()).toEqual([stored.id]);
    });

    it("refuses a retry of which only part is stored", async () => {
      await build("enforce");
      const stored = await v2Signed(moduleAction("a", 0));
      expect((await execute([stored])).status).toBe(JobStatus.READ_READY);

      const job = await retried([stored, await v2Signed(moduleAction("b", 1))]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[DUPLICATE_ACTION]");
    });
  });

  describe("re-appends are not admission", () => {
    it("does not re-verify what a backdated mutation moves", async () => {
      await build("enforce", { documentDecisions: true });
      const unverifiable = await badSignature(moduleAction("stored", 10));
      await storeDirectly(unverifiable);

      const job = await execute([await renownSigned(moduleAction("early", 0))]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(refusals).toEqual([]);
      expect((await storedActionIds()).at(-1)).toBe(unverifiable.id);
    });

    it("does not re-verify what a load reshuffles", async () => {
      await build("enforce");
      const unverifiable = await badSignature(moduleAction("stored", 10));
      await storeDirectly(unverifiable);

      const early = await renownSigned(moduleAction("early", 0));
      const job = await load([asOperation(early, 0)]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(refusals).toEqual([]);
      expect((await storedActionIds()).slice(-2)).toEqual([
        early.id,
        unverifiable.id,
      ]);
    });

    it("does not re-verify what a re-evaluation re-appends", async () => {
      await build("enforce", { documentDecisions: true });
      const unverifiable = await badSignature(moduleAction("stored", 10));
      await storeDirectly(unverifiable);

      const deletion = {
        ...deleteDocumentAction(docId),
        timestampUtcMs: at(0),
      };
      const job = await execute([deletion]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(refusals).toEqual([]);
      const reappended = (await stored()).at(-1);
      expect(reappended?.action.id).toBe(unverifiable.id);
      expect(reappended?.deniedReason).toBeDefined();
    });
  });

  describe("the trust policy", () => {
    const AUTH_ENFORCEMENT = { documentDecisions: true, authEnforcement: true };

    type Call = { key: string; address: string; documentId: string };

    /** Records every question; `answer` decides, or throws. */
    function policy(
      answer: (signer: ActionSigner, key: string) => Promise<boolean>,
    ): SignatureTrustPolicy & { calls: Call[] } {
      const calls: Call[] = [];
      return {
        calls,
        authorizeSigner(actionSigner, key, documentId) {
          calls.push({ key, address: actionSigner.user.address, documentId });
          return answer(actionSigner, key);
        },
      };
    }

    function unsigned(action: Action): Action {
      return {
        ...action,
        context: {
          signer: {
            user: { address: "0xabc", networkId: "eip155", chainId: 1 },
            app: { name: "", key: "" },
            signatures: [],
          },
        },
      };
    }

    it("by default refuses a signed write under authEnforcement", async () => {
      await build("enforce", AUTH_ENFORCEMENT);
      const job = await execute([await v2Signed(moduleAction("m"))]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.name).toBe("InvalidSignatureError");
      expect(job.error?.message).toContain("[SIGNER_UNAUTHORIZED]");
      expect(await stored()).toEqual([]);
      expect(refusals).toMatchObject([
        { code: "SIGNER_UNAUTHORIZED", path: "mutation", scheme: "v2" },
      ]);
    });

    it("by default accepts a signed write without authEnforcement", async () => {
      await build("enforce", { documentDecisions: true });
      const action = await v2Signed(moduleAction("m"));

      expect((await execute([action])).status).toBe(JobStatus.READ_READY);
      expect(await storedActionIds()).toEqual([action.id]);
    });

    it("never asks about an unsigned write", async () => {
      const trust = policy(() => Promise.resolve(false));
      await build("enforce", AUTH_ENFORCEMENT, { trustPolicy: trust });
      const action = unsigned(moduleAction("m"));

      expect((await execute([action])).status).toBe(JobStatus.READ_READY);
      expect(trust.calls).toEqual([]);
    });

    it("accepts the reactor's own key for its own user under authEnforcement", async () => {
      const trust = policy(() => Promise.resolve(false));
      await build("enforce", AUTH_ENFORCEMENT, {
        trustPolicy: trust,
        signer: signer.asISigner(),
      });
      const own = await v2Signed(moduleAction("own", 0));

      expect((await execute([own])).status).toBe(JobStatus.READ_READY);
      expect(trust.calls).toEqual([]);

      const elsewhere = moduleAction("elsewhere", 1);
      const relabelled = signer.signed(
        elsewhere,
        await signer.v2Tuple(
          elsewhere,
          { documentId: docId, branch: "main" },
          { address: "0xdef", networkId: "eip155", chainId: 1 },
        ),
      );
      relabelled.context!.signer!.user = {
        address: "0xdef",
        networkId: "eip155",
        chainId: 1,
      };
      const job = await execute([relabelled]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.message).toContain("[SIGNER_UNAUTHORIZED]");
      expect(trust.calls).toEqual([
        { key: signer.did, address: "0xdef", documentId: docId },
      ]);
    });

    it("fails a mutation it refuses, with the code in JobInfo.error", async () => {
      const trust = policy(() => Promise.resolve(false));
      await build("enforce", {}, { trustPolicy: trust });
      const job = await execute([await v2Signed(moduleAction("m"))]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.name).toBe("InvalidSignatureError");
      expect(job.error?.message).toContain("[SIGNER_UNAUTHORIZED]");
      expect(await stored()).toEqual([]);
      expect(trust.calls).toEqual([
        { key: signer.did, address: signer.user.address, documentId: docId },
      ]);
    });

    it("asks only after the integrity checks pass", async () => {
      const trust = policy(() => Promise.resolve(true));
      await build("enforce", {}, { trustPolicy: trust });
      const job = await execute([await tampered(moduleAction("m"))]);

      expect(job.error?.message).toContain("[HASH_MISMATCH]");
      expect(trust.calls).toEqual([]);
    });

    it("drops only the refused operation at load", async () => {
      const stranger = await TestP256Signer.create();
      const trust = policy((_signer, key) =>
        Promise.resolve(key !== stranger.did),
      );
      await build("enforce", {}, { trustPolicy: trust });
      const good = await v2Signed(moduleAction("a", 0));
      const strangeAction = moduleAction("b", 1);
      const strange = stranger.signed(
        strangeAction,
        await stranger.v2Tuple(strangeAction, {
          documentId: docId,
          branch: "main",
        }),
      );

      const job = await load([asOperation(good, 0), asOperation(strange, 1)]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(await storedActionIds()).toEqual([good.id]);
      expect(refusals).toMatchObject([
        { actionId: strange.id, code: "SIGNER_UNAUTHORIZED", path: "load" },
      ]);
    });

    it("fails a load it throws on, storing nothing", async () => {
      const trust = policy(() => Promise.reject(new Error("renown is down")));
      await build("enforce", {}, { trustPolicy: trust });
      const action = await v2Signed(moduleAction("m"));

      const job = await load([asOperation(action, 0)]);

      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.name).not.toBe("InvalidSignatureError");
      expect(job.error?.message).toContain("renown is down");
      expect(trust.calls.length).toBeGreaterThan(1);
      expect(await stored()).toEqual([]);
      expect(refusals).toEqual([]);
    });

    it("retries a load it threw on once, then admits it", async () => {
      let failures = 1;
      const trust = policy(() =>
        failures-- > 0
          ? Promise.reject(new Error("renown is down"))
          : Promise.resolve(true),
      );
      await build("enforce", {}, { trustPolicy: trust });
      const action = await v2Signed(moduleAction("m"));

      const job = await load([asOperation(action, 0)]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(await storedActionIds()).toEqual([action.id]);
      expect(trust.calls).toHaveLength(2);
    });

    it("retries a mutation it did not answer in time", async () => {
      let hangs = 1;
      const trust = policy(() =>
        hangs-- > 0 ? new Promise<boolean>(() => {}) : Promise.resolve(true),
      );
      await build("enforce", {}, { trustPolicy: trust, jobTimeoutMs: 400 });
      const action = await v2Signed(moduleAction("m"));

      const job = await execute([action]);

      expect(job.status).toBe(JobStatus.READ_READY);
      expect(await storedActionIds()).toEqual([action.id]);
      expect(trust.calls).toHaveLength(2);
    });

    it("reaches a ReactorBuilder from a SignerConfig unless it has its own", async () => {
      const trustPolicy = policy(() => Promise.resolve(true));
      const workerTrustPolicy = {
        module: { filePath: "/trust.js", exportName: "createTrustPolicy" },
      };
      const config = {
        signer: signer.asISigner(),
        trustPolicy,
        workerTrustPolicy,
      };

      const plain = new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule as never,
      ]);
      const forwarded = vi.spyOn(plain, "withTrustPolicy");
      const first = await new ReactorClientBuilder()
        .withReactorBuilder(plain)
        .withSigner(config)
        .buildModule();
      first.reactor.kill();
      expect(forwarded).toHaveBeenCalledWith(trustPolicy, workerTrustPolicy);

      const own = new ReactorBuilder()
        .withDocumentModelSources([documentModelDocumentModelModule as never])
        .withTrustPolicy(policy(() => Promise.resolve(false)));
      const kept = vi.spyOn(own, "withTrustPolicy");
      const second = await new ReactorClientBuilder()
        .withReactorBuilder(own)
        .withSigner(config)
        .buildModule();
      second.reactor.kill();
      expect(kept).not.toHaveBeenCalled();
    });

    describe("is not asked on a re-append", () => {
      let stranger: TestP256Signer;
      let trust: ReturnType<typeof policy>;

      beforeAll(async () => {
        stranger = await TestP256Signer.create();
      });

      async function storeStranger(offsetMs: number): Promise<Action> {
        const action = moduleAction("stranger", offsetMs);
        const signed = stranger.signed(
          action,
          await stranger.v2Tuple(action, { documentId: docId, branch: "main" }),
        );
        await storeDirectly(signed);
        return signed;
      }

      async function buildRefusingStranger(
        featureFlags: Partial<ReactorFeatureFlags>,
      ): Promise<void> {
        trust = policy((_signer, key) => Promise.resolve(key !== stranger.did));
        await build("enforce", featureFlags, { trustPolicy: trust });
      }

      it("by a backdated mutation", async () => {
        await buildRefusingStranger({ documentDecisions: true });
        const moved = await storeStranger(10);

        const job = await execute([await v2Signed(moduleAction("early", 0))]);

        expect(job.status).toBe(JobStatus.READ_READY);
        expect(trust.calls.map((call) => call.key)).toEqual([signer.did]);
        expect((await storedActionIds()).at(-1)).toBe(moved.id);
      });

      it("by a load reshuffle", async () => {
        await buildRefusingStranger({});
        const moved = await storeStranger(10);

        const early = await v2Signed(moduleAction("early", 0));
        const job = await load([asOperation(early, 0)]);

        expect(job.status).toBe(JobStatus.READ_READY);
        expect(trust.calls.map((call) => call.key)).toEqual([signer.did]);
        expect((await storedActionIds()).slice(-2)).toEqual([
          early.id,
          moved.id,
        ]);
      });

      it("by a re-evaluation", async () => {
        await buildRefusingStranger({ documentDecisions: true });
        const moved = await storeStranger(10);

        const deletion = {
          ...deleteDocumentAction(docId),
          timestampUtcMs: at(0),
        };
        const job = await execute([deletion]);

        expect(job.status).toBe(JobStatus.READ_READY);
        expect(trust.calls).toEqual([]);
        const reappended = (await stored()).at(-1);
        expect(reappended?.action.id).toBe(moved.id);
      });
    });
  });
});
