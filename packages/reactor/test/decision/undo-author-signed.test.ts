import type {
  Action,
  DocumentModelDocument,
  Grant,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  initializeAuth,
  positionalOperations,
  undo,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { storedRows } from "../executor/one-rule-agreement.js";
import {
  authorRetraction,
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { signedAs, TRUST_ANY_SIGNER } from "../utils/signed-as.js";

const ADMIN = "0xAdmin";
const WRITER = "0xWriter";

// The writer may add modules and retract, but neither UNDO nor anything else.
const grants: Grant[] = [
  {
    id: "g-admin",
    description: "admin executes everything",
    effect: "allow",
    principal: { address: ADMIN },
    capability: { can: "execute", scope: "*" },
  },
  {
    id: "g-writer",
    description: "writer adds and retracts modules",
    effect: "allow",
    principal: { address: WRITER },
    capability: {
      can: "execute",
      scope: "global",
      operation: ["ADD_MODULE", "RETRACT"],
    },
  },
];

function stamp(second: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
}

// An undo is a RETRACT its author signs, so every replica decides it the same.
describe("base-reducer 3 undo signed by its author", () => {
  let host: InProcessReactorModule;
  let peer: InProcessReactorModule;

  const gated = () =>
    createUndoV3ReactorBuilder({
      featureFlags: { documentDecisions: true, authEnforcement: true },
    })
      .withTrustPolicy(TRUST_ANY_SIGNER)
      .buildModule();

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(stamp(10)));
    host = await gated();
    peer = await gated();
  });

  afterEach(() => {
    host.reactor.kill();
    peer.reactor.kill();
    vi.useRealTimers();
  });

  async function settle(reactor: IReactor, job: JobInfo): Promise<JobInfo> {
    await vi.waitUntil(
      async () => {
        const { status } = await reactor.getJobStatus(job.id);
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 10_000 },
    );
    return reactor.getJobStatus(job.id);
  }

  async function execute(docId: string, action: Action): Promise<JobInfo> {
    return settle(
      host.reactor,
      await host.reactor.execute(docId, "main", [action]),
    );
  }

  async function writer(
    docId: string,
    action: Action,
    second: number,
  ): Promise<JobInfo> {
    return execute(
      docId,
      await signedAs(
        { ...action, timestampUtcMs: stamp(second) },
        WRITER,
        docId,
      ),
    );
  }

  async function modules(
    module: InProcessReactorModule,
    docId: string,
  ): Promise<string[]> {
    const served = await module.reactor.get<DocumentModelDocument>(docId);
    return served.state.global.specifications[0].modules.map(
      (entry) => entry.id,
    );
  }

  async function verdicts(module: InProcessReactorModule, docId: string) {
    return positionalOperations(await storedRows(module, docId)).map(
      (operation) => ({
        type: operation.action.type,
        signer: operation.action.context?.signer?.user.address,
        denied: operation.deniedReason !== undefined,
      }),
    );
  }

  async function replicate(docId: string): Promise<void> {
    for (const scope of ["document", "auth", "global"]) {
      const page = await host.reactor.getOperations(docId, {
        branch: "main",
        scopes: [scope],
      });
      const rows = (page as Record<string, { results: Operation[] }>)[scope]
        .results;
      const job = await settle(
        peer.reactor,
        await peer.reactor.load(docId, "main", rows),
      );
      expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    }
  }

  async function undoneByWriter(): Promise<string> {
    const document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    const docId = document.header.id;
    await settle(host.reactor, await host.reactor.create(document));
    const auth = await execute(docId, {
      ...initializeAuth({ version: 1, grants }),
      timestampUtcMs: stamp(1),
    });
    expect(auth.error?.message ?? auth.status).toBe(JobStatus.READ_READY);
    const added = await writer(docId, addModule({ id: "m1", name: "m1" }), 2);
    expect(added.error?.message ?? added.status).toBe(JobStatus.READ_READY);

    const retraction = await authorRetraction(host.reactor, docId);
    const undone = await writer(docId, retraction, 3);
    expect(undone.error?.message ?? undone.status).toBe(JobStatus.READ_READY);
    return docId;
  }

  it("stores the RETRACT under the author's signature and refuses a submitted UNDO", async () => {
    const docId = await undoneByWriter();

    expect(await verdicts(host, docId)).toEqual([
      { type: "ADD_MODULE", signer: WRITER, denied: false },
      { type: "RETRACT", signer: WRITER, denied: false },
    ]);
    expect(await modules(host, docId)).toEqual([]);

    const submitted = await writer(docId, undo(), 4);
    expect(submitted.error?.name).toBe("SubmittedUndoRefusedError");
  });

  it("keeps the undo applied on a peer that loads it", async () => {
    const docId = await undoneByWriter();

    await replicate(docId);

    expect(await verdicts(peer, docId)).toEqual(await verdicts(host, docId));
    expect(await modules(peer, docId)).toEqual([]);
  });

  it("keeps the undo applied when a later backdated write re-decides it", async () => {
    const docId = await undoneByWriter();

    const backdated = await writer(
      docId,
      addModule({ id: "m2", name: "m2" }),
      2,
    );
    expect(backdated.error?.message ?? backdated.status).toBe(
      JobStatus.READ_READY,
    );

    expect(
      (await verdicts(host, docId)).filter((row) => row.type === "RETRACT"),
    ).toEqual([{ type: "RETRACT", signer: WRITER, denied: false }]);
    expect(await modules(host, docId)).toEqual(["m2"]);
  });
});
