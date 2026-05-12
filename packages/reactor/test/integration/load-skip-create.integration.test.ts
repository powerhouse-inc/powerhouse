import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

/**
 * Reproduces the sync race described in
 * ~/Downloads/reactor-browser-skip1-create-document-sync-race.md:
 * when CREATE_DOCUMENT is delivered in one sync envelope and the
 * follow-up UPGRADE_DOCUMENT is delivered in a later envelope, the
 * second envelope's load job dead-letters with
 * "RevisionMismatchError: expected 1, got 0".
 */
describe("Load with pre-seeded CREATE_DOCUMENT", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;

  beforeEach(async () => {
    vi.useFakeTimers();

    const builderA = new ReactorBuilder().withDocumentModels([
      documentModelDocumentModelModule as any,
      driveDocumentModelModule as any,
    ]);
    reactorA = await builderA.build();

    const builderB = new ReactorBuilder().withDocumentModels([
      documentModelDocumentModelModule as any,
      driveDocumentModelModule as any,
    ]);
    reactorB = await builderB.build();
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();
    vi.useRealTimers();
  });

  it("applies a later UPGRADE_DOCUMENT envelope on top of a pre-existing CREATE_DOCUMENT", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const document = createDocModelDocument({
      id: "split-envelope-doc",
      slug: "split-envelope-doc",
    });

    let info = await reactorA.create(document);
    const createTokenA = await waitForJobCompletion(reactorA, info.id);

    const aDocOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      createTokenA,
    );

    expect(aDocOps.document.results).toHaveLength(2);
    expect(aDocOps.document.results[0].action.type).toBe("CREATE_DOCUMENT");
    expect(aDocOps.document.results[1].action.type).toBe("UPGRADE_DOCUMENT");

    // Envelope 1: deliver only the CREATE_DOCUMENT op to reactor B.
    info = await reactorB.load(document.header.id, "main", [
      aDocOps.document.results[0],
    ]);
    const envelope1Token = await waitForJobCompletion(reactorB, info.id);

    const bAfterCreate = await reactorB.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      envelope1Token,
    );
    expect(bAfterCreate.document.results).toHaveLength(1);
    expect(bAfterCreate.document.results[0].index).toBe(0);
    expect(bAfterCreate.document.results[0].action.type).toBe(
      "CREATE_DOCUMENT",
    );

    // Mirror the ~60s gap between Phase 2 (creates) and Phase 4 (later ops)
    // from the bug report, so timestamps are clearly separated.
    vi.advanceTimersByTime(60_000);

    // Envelope 2: deliver only the UPGRADE_DOCUMENT op (index 1). The local
    // store already has CREATE_DOCUMENT at index 0 (revision = 1), so this
    // should append cleanly. The bug causes executeLoadJob to synthesise
    // a CREATE_DOCUMENT with skip:1 at index 0 and fail with
    // "Revision mismatch: expected 1, got 0".
    info = await reactorB.load(document.header.id, "main", [
      aDocOps.document.results[1],
    ]);
    const envelope2Token = await waitForJobCompletion(reactorB, info.id);

    const bAfterUpgrade = await reactorB.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      envelope2Token,
    );

    expect(bAfterUpgrade.document.results).toHaveLength(2);
    expect(bAfterUpgrade.document.results.map((op) => op.index)).toEqual([
      0, 1,
    ]);
    expect(bAfterUpgrade.document.results.map((op) => op.skip)).toEqual([0, 0]);
    expect(bAfterUpgrade.document.results.map((op) => op.action.type)).toEqual([
      "CREATE_DOCUMENT",
      "UPGRADE_DOCUMENT",
    ]);
  });
});

async function waitForJobCompletion(
  reactor: IReactor,
  jobId: string,
): Promise<ConsistencyToken> {
  await vi.waitUntil(async () => {
    const status = await reactor.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message || "Job failed");
    }
    return status.status === JobStatus.READ_READY;
  });

  const status = await reactor.getJobStatus(jobId);
  return status.consistencyToken;
}
