import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
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

// Anyone may write the global scope only while the model name is unset.
const whileUnnamed: Grant = {
  id: "g-while-unnamed",
  description: "open until named",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "global" },
  where: { eq: [{ attr: "doc.global.name" }, { lit: "" }] },
};

describe("conditions end to end", () => {
  let reactor: IReactor;

  async function build(authConditions: boolean): Promise<IReactor> {
    return new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({
        featureFlags: {
          documentDecisions: true,
          authEnforcement: true,
          authGroups: true,
          authConditions,
        },
      })
      .build();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    reactor?.kill();
    vi.useRealTimers();
  });

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

  async function appliedGlobal(
    documentId: string,
  ): Promise<Array<{ type: string; denied: boolean }>> {
    const result = await reactor.getOperations(documentId, {
      branch: "main",
      scopes: ["global"],
    });
    const stored = (result as Record<string, { results: Operation[] }>).global
      .results;
    return garbageCollect(sortOperations([...stored])).map((operation) => ({
      type: operation.action.type,
      denied: operation.deniedReason !== undefined,
    }));
  }

  async function createGatedDocument(id: string): Promise<string> {
    const document = createDocModelDocument({ id });
    const error = await settle((await reactor.create(document)).id);
    expect(error).toBeUndefined();

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    const authError = await settle(
      (
        await reactor.execute(document.header.id, "main", [
          initializeAuth({ version: 1, grants: [adminGrant, whileUnnamed] }),
        ])
      ).id,
    );
    expect(authError).toBeUndefined();
    return document.header.id;
  }

  it("a where clause gates admission on the executing scope's state", async () => {
    reactor = await build(true);
    const docId = await createGatedDocument("conditions-doc");

    // Open while the name is unset.
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    expect(
      await settle(
        (
          await reactor.execute(docId, "main", [
            signedBy(addModule({ id: "m1", name: "m1" }), WRITER),
          ])
        ).id,
      ),
    ).toBeUndefined();

    // The admin names the model, which closes the conditional grant.
    vi.setSystemTime(new Date("2026-01-01T00:00:03.000Z"));
    expect(
      await settle(
        (
          await reactor.execute(docId, "main", [
            signedBy(setModelName({ name: "locked" }), ADMIN),
          ])
        ).id,
      ),
    ).toBeUndefined();

    vi.setSystemTime(new Date("2026-01-01T00:00:04.000Z"));
    const refusal = await settle(
      (
        await reactor.execute(docId, "main", [
          signedBy(addModule({ id: "m2", name: "m2" }), WRITER),
        ])
      ).id,
    );
    expect(refusal).toMatch(/denied|Authorization/i);

    // The admin's own writes are unaffected.
    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
    expect(
      await settle(
        (
          await reactor.execute(docId, "main", [
            signedBy(addModule({ id: "m3", name: "m3" }), ADMIN),
          ])
        ).id,
      ),
    ).toBeUndefined();
  });

  it("a backdated state change re-judges later operations at their positions", async () => {
    reactor = await build(true);
    const docId = await createGatedDocument("conditions-positional");

    // Admitted while the name is unset.
    vi.setSystemTime(new Date("2026-01-01T00:00:03.000Z"));
    expect(
      await settle(
        (
          await reactor.execute(docId, "main", [
            signedBy(addModule({ id: "m1", name: "m1" }), WRITER),
          ])
        ).id,
      ),
    ).toBeUndefined();
    expect(await appliedGlobal(docId)).toEqual([
      { type: "ADD_MODULE", denied: false },
    ]);

    // The admin names the model with a timestamp before the writer's
    // operation, so at the writer's position the grant no longer holds.
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    expect(
      await settle(
        (
          await reactor.execute(docId, "main", [
            signedBy(setModelName({ name: "locked" }), ADMIN),
          ])
        ).id,
      ),
    ).toBeUndefined();

    await vi.waitUntil(
      async () =>
        (await appliedGlobal(docId)).some((operation) => operation.denied),
      { timeout: 10_000 },
    );

    expect(await appliedGlobal(docId)).toEqual([
      { type: "SET_MODEL_NAME", denied: false },
      { type: "ADD_MODULE", denied: true },
    ]);
  });

  it("conditional grants never apply while the flag is off", async () => {
    reactor = await build(false);
    const docId = await createGatedDocument("conditions-off");

    // The name is unset, but the conditional grant does not apply: deny.
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    const refusal = await settle(
      (
        await reactor.execute(docId, "main", [
          signedBy(addModule({ id: "m1", name: "m1" }), WRITER),
        ])
      ).id,
    );
    expect(refusal).toMatch(/denied|Authorization/i);
  });
});
