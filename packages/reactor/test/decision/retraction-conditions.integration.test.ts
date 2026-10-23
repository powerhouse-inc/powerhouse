import type {
  Action,
  DocumentModelDocument,
  Grant,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  initializeAuth,
  retract,
  setModelName,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
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

// Anyone may write the global scope only while the model name is unset.
const whileUnnamed: Grant = {
  id: "g-while-unnamed",
  description: "open until named",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "global" },
  where: { eq: [{ attr: "doc.global.name" }, { lit: "" }] },
};

// A load is decided by the positional walk, row by row.
describe("conditions over a RETRACT on base-reducer 3", () => {
  let open: IReactor;
  let gated: IReactor;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    open = await createUndoV3ReactorBuilder()
      .withTrustPolicy(TRUST_ANY_SIGNER)
      .build();
    gated = await createUndoV3ReactorBuilder({
      featureFlags: {
        documentDecisions: true,
        authEnforcement: true,
        authGroups: true,
        authConditions: true,
      },
    })
      .withTrustPolicy(TRUST_ANY_SIGNER)
      .build();
  });

  afterEach(() => {
    open.kill();
    gated.kill();
    vi.useRealTimers();
  });

  async function settle(
    reactor: IReactor,
    jobId: string,
  ): Promise<ConsistencyToken> {
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
    return status.consistencyToken;
  }

  /** Builds and executes each action on the open reactor, one second apart. */
  async function writeOpen(
    docId: string,
    builders: Array<() => Action | Promise<Action>>,
  ): Promise<void> {
    for (const [i, build] of builders.entries()) {
      vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, 0, i + 1)));
      const action = await build();
      await settle(open, (await open.execute(docId, "main", [action])).id);
    }
  }

  /** Loads the open reactor's document, auth and global streams, in that order. */
  async function copyToGated(docId: string): Promise<void> {
    for (const scope of ["document", "auth", "global"]) {
      const page = await open.getOperations(docId, {
        branch: "main",
        scopes: [scope],
      });
      const rows = (page as Record<string, { results: Operation[] }>)[scope]
        .results;
      await settle(gated, (await gated.load(docId, "main", rows)).id);
    }
  }

  async function gatedGlobal(
    docId: string,
  ): Promise<Array<{ type: string; denied: boolean }>> {
    const page = await gated.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });
    return page.global.results.map((operation) => ({
      type: operation.action.type,
      denied: operation.deniedReason !== undefined,
    }));
  }

  async function gatedState(docId: string) {
    const document = await gated.get<DocumentModelDocument>(docId);
    return {
      name: document.state.global.name,
      modules: document.state.global.specifications[0].modules.map(
        (entry) => entry.id,
      ),
    };
  }

  async function history(retractor: string): Promise<string> {
    const document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    const docId = document.header.id;
    await settle(open, (await open.create(document)).id);

    let name: Action | undefined;
    await writeOpen(docId, [
      () => initializeAuth({ version: 1, grants: [adminGrant, whileUnnamed] }),
      async () =>
        (name = await signedAs(setModelName({ name: "locked" }), ADMIN, docId)),
      () => signedAs(retract(name!.id), retractor, docId),
      () => signedAs(addModule({ id: "m1", name: "m1" }), WRITER, docId),
    ]);
    await copyToGated(docId);
    return docId;
  }

  it("judges a write after a RETRACT against the state it restored", async () => {
    const docId = await history(ADMIN);

    expect(await gatedGlobal(docId)).toEqual([
      { type: "SET_MODEL_NAME", denied: false },
      { type: "RETRACT", denied: false },
      { type: "ADD_MODULE", denied: false },
    ]);
    expect(await gatedState(docId)).toEqual({ name: "", modules: ["m1"] });
  });

  it("leaves a refused RETRACT without effect on the rows after it", async () => {
    const docId = await history(WRITER);

    expect(await gatedGlobal(docId)).toEqual([
      { type: "SET_MODEL_NAME", denied: false },
      { type: "RETRACT", denied: true },
      { type: "ADD_MODULE", denied: true },
    ]);
    expect(await gatedState(docId)).toEqual({ name: "locked", modules: [] });
  });
});
