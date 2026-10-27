import type {
  Action,
  DocumentModelDocument,
  Grant,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  initializeAuth,
  positionalOperations,
  retract,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import { firstOutOfOrderPair } from "../../src/decision/stream-order.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  assertOneRuleAgreement,
  storedRows,
} from "../executor/one-rule-agreement.js";
import {
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { signedAs, TRUST_ANY_SIGNER } from "../utils/signed-as.js";

const ADMIN = "0xAdmin";
const WRITER = "0xWriter";

const adminGrant: Grant = {
  id: "g-admin",
  description: "admin executes everything",
  effect: "allow",
  principal: { address: ADMIN },
  capability: { can: "execute", scope: "*" },
};

function stamp(second: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
}

// Global arrives before auth, under no policy; the earlier auth stream then re-evaluates it.
describe("reevaluateDocument on base-reducer 3", () => {
  let open: IReactor;
  let gated: InProcessReactorModule;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    open = await createUndoV3ReactorBuilder()
      .withTrustPolicy(TRUST_ANY_SIGNER)
      .build();
    gated = await createUndoV3ReactorBuilder({
      featureFlags: { documentDecisions: true, authEnforcement: true },
    })
      .withTrustPolicy(TRUST_ANY_SIGNER)
      .withWriteCacheConfig({ keyframeInterval: 2 })
      .buildModule();
  });

  afterEach(() => {
    open.kill();
    gated.reactor.kill();
    vi.useRealTimers();
  });

  async function settle(reactor: IReactor, jobId: string): Promise<void> {
    await vi.waitUntil(
      async () => {
        const { status } = await reactor.getJobStatus(jobId);
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 10_000 },
    );
    const status = await reactor.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message ?? "job failed");
    }
  }

  async function signed(
    action: Action,
    second: number,
    address: string,
    docId: string,
  ): Promise<Action> {
    return signedAs(
      { ...action, timestampUtcMs: stamp(second) },
      address,
      docId,
    );
  }

  async function copy(docId: string, scope: string): Promise<void> {
    const page = await open.getOperations(docId, {
      branch: "main",
      scopes: [scope],
    });
    const rows = (page as Record<string, { results: Operation[] }>)[scope]
      .results;
    await settle(
      gated.reactor,
      (await gated.reactor.load(docId, "main", rows)).id,
    );
  }

  async function verdicts(docId: string) {
    return positionalOperations(await storedRows(gated, docId)).map(
      (operation) => ({
        type: operation.action.type,
        denied: operation.deniedReason !== undefined,
      }),
    );
  }

  async function modules(docId: string): Promise<string[]> {
    const served = await gated.reactor.get<DocumentModelDocument>(docId);
    return served.state.global.specifications[0].modules.map(
      (entry) => entry.id,
    );
  }

  async function history(): Promise<{ docId: string; document: PHDocument }> {
    const document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    const docId = document.header.id;
    await settle(open, (await open.create(document)).id);

    const m1 = await signed(
      addModule({ id: "m1", name: "m1" }),
      2,
      ADMIN,
      docId,
    );
    const writes = [
      {
        ...initializeAuth({ version: 1, grants: [adminGrant] }),
        timestampUtcMs: stamp(1),
      },
      m1,
      await signed(retract(m1.id), 3, WRITER, docId),
      await signed(addModule({ id: "m2", name: "m2" }), 4, ADMIN, docId),
    ];
    for (const action of writes) {
      await settle(open, (await open.execute(docId, "main", [action])).id);
    }
    return { docId, document };
  }

  async function headModules(docId: string): Promise<string[]> {
    const head = (await gated.writeCache.getState(
      docId,
      "global",
      "main",
    )) as DocumentModelDocument;
    return head.state.global.specifications[0].modules.map((entry) => entry.id);
  }

  it("re-derives the rows after a RETRACT the pass refuses", async () => {
    const { docId } = await history();
    await copy(docId, "document");
    await copy(docId, "global");

    expect(await verdicts(docId)).toEqual([
      { type: "ADD_MODULE", denied: false },
      { type: "RETRACT", denied: false },
      { type: "ADD_MODULE", denied: false },
    ]);
    expect(await modules(docId)).toEqual(["m2"]);

    await copy(docId, "auth");

    expect(await verdicts(docId)).toEqual([
      { type: "ADD_MODULE", denied: false },
      { type: "RETRACT", denied: true },
      { type: "ADD_MODULE", denied: false },
    ]);
    expect(await headModules(docId)).toEqual(["m1", "m2"]);
    gated.writeCache.invalidate(docId);
    expect(await headModules(docId)).toEqual(["m1", "m2"]);
  });

  it("serves the state the pass re-derived", async () => {
    const { docId, document } = await history();
    await copy(docId, "document");
    await copy(docId, "global");
    await copy(docId, "auth");

    expect(await modules(docId)).toEqual(["m1", "m2"]);
    await assertOneRuleAgreement({ module: gated, document });
  });

  it("stores no applied-twice error on any row the pass re-appends", async () => {
    const { docId } = await history();
    await copy(docId, "document");
    await copy(docId, "global");
    await copy(docId, "auth");

    const rows = await storedRows(gated, docId);
    expect(rows.some((operation) => operation.skip > 0)).toBe(true);
    expect(
      rows
        .filter((operation) => operation.error)
        .map((operation) => `${operation.index}: ${operation.error}`),
    ).toEqual([]);
    expect(firstOutOfOrderPair(rows)).toBeUndefined();
  });
});

describe("firstOutOfOrderPair on base-reducer 3 rows", () => {
  function row(
    actionId: string,
    index: number,
    second: number,
    extra: { target?: string; skip?: number } = {},
  ): Operation {
    const timestampUtcMs = stamp(second);
    const action =
      extra.target === undefined
        ? { ...addModule({ id: actionId, name: actionId }), id: actionId }
        : { ...retract(extra.target), id: actionId };
    return {
      id: `op-${actionId}`,
      index,
      skip: extra.skip ?? 0,
      hash: "",
      timestampUtcMs,
      action: { ...action, timestampUtcMs },
    };
  }

  it("still orders a row a live RETRACT names", () => {
    const pair = firstOutOfOrderPair([
      row("a", 0, 2),
      row("b", 1, 1),
      row("r", 2, 3, { target: "a" }),
    ]);

    expect(pair).toMatchObject({
      previous: { action: { id: "a" } },
      current: { action: { id: "b" } },
      kind: "descending",
    });
  });

  it("orders a RETRACT row like any other", () => {
    const pair = firstOutOfOrderPair([
      row("a", 0, 1),
      row("r", 1, 3, { target: "a" }),
      row("b", 2, 2),
    ]);

    expect(pair).toMatchObject({
      previous: { action: { id: "r" } },
      current: { action: { id: "b" } },
      kind: "descending",
    });
  });

  it("leaves out only the rows a rewind covers", () => {
    expect(
      firstOutOfOrderPair([
        row("a", 0, 1),
        row("b", 1, 3),
        row("r", 2, 2, { target: "b", skip: 1 }),
        row("b2", 3, 3),
      ]),
    ).toBeUndefined();
  });
});
