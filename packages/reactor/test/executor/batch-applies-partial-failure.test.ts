import type {
  Action,
  Grant,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  garbageCollect,
  initializeAuth,
  setModelName,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

const ADMIN = "0xAdmin";
const WRITER = "0xWriter";

function signedBy<T extends Action>(action: T, address: string): T {
  return {
    ...action,
    context: {
      signer: {
        user: { address, networkId: "", chainId: 0 },
        app: { name: "test", key: "" },
        signatures: [],
      },
    },
  };
}

const adminGrant: Grant = {
  id: "g-admin",
  description: "admin executes everything",
  effect: "allow",
  principal: { address: ADMIN },
  capability: { can: "execute", scope: "*" },
};

const whileUnnamed: Grant = {
  id: "g-while-unnamed",
  description: "open until named",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "global" },
  where: { eq: [{ attr: "doc.global.name" }, { lit: "" }] },
};

/** batchApplies documents that a failed job leaves nothing behind. */
describe("batched applies: what a partial failure leaves behind", () => {
  let reactor: IReactor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    reactor?.kill();
    vi.useRealTimers();
  });

  async function build(): Promise<IReactor> {
    return new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({
        featureFlags: {
          documentDecisions: true,
          authEnforcement: true,
          authGroups: true,
          authConditions: true,
        },
      })
      .build();
  }

  async function settle(jobId: string): Promise<string | undefined> {
    await vi.waitUntil(async () => {
      const status = await reactor.getJobStatus(jobId);
      return (
        status.status === JobStatus.FAILED ||
        status.status === JobStatus.READ_READY
      );
    });
    const status = await reactor.getJobStatus(jobId);
    return status.status === JobStatus.FAILED
      ? (status.error?.message ?? "job failed")
      : undefined;
  }

  async function appliedGlobal(documentId: string): Promise<string[]> {
    const result = await reactor.getOperations(documentId, {
      branch: "main",
      scopes: ["global"],
    });
    const stored = (result as Record<string, { results: Operation[] }>).global
      .results;
    return garbageCollect(sortOperations([...stored])).map(
      (operation) => operation.action.type,
    );
  }

  async function createGatedDocument(id: string): Promise<string> {
    const document = createDocModelDocument({ id });
    expect(await settle((await reactor.create(document)).id)).toBeUndefined();

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    expect(
      await settle(
        (
          await reactor.execute(document.header.id, "main", [
            initializeAuth({ version: 1, grants: [adminGrant, whileUnnamed] }),
          ])
        ).id,
      ),
    ).toBeUndefined();
    return document.header.id;
  }

  it("a job that fails partway through leaves nothing behind", async () => {
    reactor = await build();
    const docId = await createGatedDocument("partial-failure");

    // naming the model closes the grant the module after it needs
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    const refusal = await settle(
      (
        await reactor.execute(docId, "main", [
          signedBy(setModelName({ name: "locked" }), WRITER),
          signedBy(addModule({ id: "m1", name: "m1" }), WRITER),
        ])
      ).id,
    );

    expect(refusal).toMatch(/denied|Authorization/i);
    expect(await appliedGlobal(docId)).toEqual([]);
  });
});
