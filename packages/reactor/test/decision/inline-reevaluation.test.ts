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
  removeGrant,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InProcessReactorModule, IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { storedRows } from "../executor/one-rule-agreement.js";
import {
  createBaseReducer3Document,
  createDocModelDocument,
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

const writerGrant: Grant = {
  ...adminGrant,
  id: "g-writer",
  description: "writer executes everything",
  principal: { address: WRITER },
};

function stamp(second: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
}

// A write or load that starts a re-evaluation reports the rows it re-appends.
function inlineReevaluation(
  label: string,
  createDocument: () => PHDocument,
): void {
  describe(label, () => {
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

    async function execute(
      reactor: IReactor,
      docId: string,
      action: Action,
    ): Promise<void> {
      await settle(
        reactor,
        (await reactor.execute(docId, "main", [action])).id,
      );
    }

    function signed(
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

    async function modules(docId: string): Promise<string[]> {
      const served = await gated.reactor.get<DocumentModelDocument>(docId);
      return served.state.global.specifications[0].modules.map(
        (entry) => entry.id,
      );
    }

    async function headModules(docId: string): Promise<string[]> {
      const head = (await gated.writeCache.getState(
        docId,
        "global",
        "main",
      )) as DocumentModelDocument;
      return head.state.global.specifications[0].modules.map(
        (entry) => entry.id,
      );
    }

    async function deniedModules(docId: string): Promise<string[]> {
      return (await storedRows(gated, docId))
        .filter((operation) => operation.deniedReason !== undefined)
        .map((operation) => (operation.action.input as { id: string }).id);
    }

    it("serves the rows a load's pass denies", async () => {
      const document = createDocument();
      const docId = document.header.id;
      await settle(open, (await open.create(document)).id);
      await execute(open, docId, {
        ...initializeAuth({ version: 1, grants: [adminGrant] }),
        timestampUtcMs: stamp(1),
      });
      await execute(
        open,
        docId,
        await signed(addModule({ id: "m1", name: "m1" }), 2, WRITER, docId),
      );
      await execute(
        open,
        docId,
        await signed(addModule({ id: "m2", name: "m2" }), 3, ADMIN, docId),
      );

      await copy(docId, "document");
      await copy(docId, "global");
      expect(await modules(docId)).toEqual(["m1", "m2"]);

      await copy(docId, "auth");

      expect(await deniedModules(docId)).toEqual(["m1"]);
      expect(await headModules(docId)).toEqual(["m2"]);
      expect(await modules(docId)).toEqual(["m2"]);
    });

    it("serves the rows an execute's pass denies", async () => {
      const document = createDocument();
      const docId = document.header.id;
      await settle(gated.reactor, (await gated.reactor.create(document)).id);
      await execute(
        gated.reactor,
        docId,
        await signed(
          initializeAuth({ version: 1, grants: [adminGrant, writerGrant] }),
          1,
          ADMIN,
          docId,
        ),
      );
      await execute(
        gated.reactor,
        docId,
        await signed(addModule({ id: "m1", name: "m1" }), 5, WRITER, docId),
      );
      expect(await modules(docId)).toEqual(["m1"]);

      await execute(
        gated.reactor,
        docId,
        await signed(removeGrant({ id: "g-writer" }), 3, ADMIN, docId),
      );

      expect(await deniedModules(docId)).toEqual(["m1"]);
      expect(await headModules(docId)).toEqual([]);
      expect(await modules(docId)).toEqual([]);
    });
  });
}

inlineReevaluation("inline re-evaluation on base-reducer 2", () =>
  createDocModelDocument({
    signaturePolicy: "legacy",
    protocolVersions: { "base-reducer": 2 },
  }),
);

inlineReevaluation("inline re-evaluation on base-reducer 3", () =>
  createBaseReducer3Document({ signaturePolicy: "legacy" }),
);
