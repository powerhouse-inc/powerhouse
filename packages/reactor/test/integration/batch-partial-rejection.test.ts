import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  addFolder,
  deleteNode,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import { generateId } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";

// A rejected action does not fail its job, so `JobInfo.result` is the only
// place a caller learns it was rejected.
describe("a batch whose middle action a reducer rejects", () => {
  let reactor: IReactor;

  beforeEach(async () => {
    reactor = await new ReactorBuilder()
      .withDocumentModelSources([driveDocumentModelModule as any])
      .build();
  });

  afterEach(() => {
    reactor.kill();
  });

  async function waitForReadReady(jobId: string): Promise<void> {
    await vi.waitUntil(
      async () => {
        const status = await reactor.getJobStatus(jobId);
        if (status.status === JobStatus.FAILED) {
          throw new Error(
            `Job failed: ${status.error?.message ?? "unknown error"}`,
          );
        }
        return status.status === JobStatus.READ_READY;
      },
      { timeout: 5000 },
    );
  }

  it("reaches READ_READY, keeps the other two actions, and names the rejected one", async () => {
    const document = driveDocumentModelModule.utils.createDocument();
    const documentId = document.header.id;
    await waitForReadReady((await reactor.create(document)).id);

    const first = addFolder({ id: generateId(), name: "first" });
    const rejected = deleteNode({ id: "never-existed" });
    const third = addFolder({ id: generateId(), name: "third" });

    const jobInfo = await reactor.execute(documentId, "main", [
      first,
      rejected,
      third,
    ]);
    await waitForReadReady(jobInfo.id);

    const status = await reactor.getJobStatus(jobInfo.id);
    expect(status.status).toBe(JobStatus.READ_READY);
    expect(status.error).toBeUndefined();

    expect(status.result?.allApplied).toBe(false);
    expect(status.result?.actions.map((action) => action.actionId)).toEqual([
      first.id,
      rejected.id,
      third.id,
    ]);
    expect(status.result?.actions[0].kind).toBe("applied");
    expect(status.result?.actions[2].kind).toBe("applied");

    const middle = status.result?.actions[1];
    expect(middle?.kind).toBe("reducer-error");
    expect(
      middle?.kind === "reducer-error" ? middle.message : undefined,
    ).toContain("not found");

    const stored = await reactor.get<DocumentDriveDocument>(documentId);
    expect(stored.state.global.nodes.map((node) => node.name).sort()).toEqual([
      "first",
      "third",
    ]);
  });

  it("reports every action applied when the whole batch succeeds", async () => {
    const document = driveDocumentModelModule.utils.createDocument();
    const documentId = document.header.id;
    await waitForReadReady((await reactor.create(document)).id);

    const jobInfo = await reactor.execute(documentId, "main", [
      addFolder({ id: generateId(), name: "first" }),
      addFolder({ id: generateId(), name: "second" }),
    ]);
    await waitForReadReady(jobInfo.id);

    const status = await reactor.getJobStatus(jobInfo.id);
    expect(status.result?.allApplied).toBe(true);
    expect(status.result?.actions).toHaveLength(2);
  });
});
