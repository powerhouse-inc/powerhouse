import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  addFolder,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import {
  generateId,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { KeyframeSettings } from "../../src/storage/keyframes/keyframe-settings.js";

const DRIVE_TYPE = "powerhouse/document-drive";

// IReactor.execute takes no signer, so its writes go unsigned.
function createLegacyDrive(): DocumentDriveDocument {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
  );
}

describe("keyframe rules through a whole reactor", () => {
  let module: InProcessReactorModule | undefined;

  afterEach(async () => {
    await module?.shutdown();
    module = undefined;
  });

  async function build(
    keyframes?: KeyframeSettings,
  ): Promise<InProcessReactorModule> {
    const builder = new ReactorBuilder().withDocumentModelSources([
      driveDocumentModelModule as any,
    ]);
    if (keyframes) builder.withKeyframes(keyframes);
    module = await builder.buildModule();
    return module;
  }

  async function waitForReadReady(
    built: InProcessReactorModule,
    jobId: string,
  ): Promise<void> {
    await vi.waitUntil(
      async () => {
        const status = await built.reactor.getJobStatus(jobId);
        if (status.status === JobStatus.FAILED) {
          throw new Error(
            `Job failed: ${status.error?.message ?? "unknown error"}`,
          );
        }
        return status.status === JobStatus.READ_READY;
      },
      { timeout: 10_000 },
    );
  }

  async function writeFolders(
    built: InProcessReactorModule,
    count: number,
  ): Promise<string> {
    const document = createLegacyDrive();
    const documentId = document.header.id;
    await waitForReadReady(built, (await built.reactor.create(document)).id);
    for (let index = 0; index < count; index++) {
      const job = await built.reactor.execute(documentId, "main", [
        addFolder({ id: generateId(), name: `folder-${index}` }),
      ]);
      await waitForReadReady(built, job.id);
    }
    return documentId;
  }

  async function globalKeyframes(
    built: InProcessReactorModule,
    documentId: string,
  ): Promise<number[]> {
    const rows = await built.keyframeStore.listKeyframes(
      documentId,
      "global",
      "main",
    );
    return rows.map((row) => row.revision);
  }

  it("writes every 10th revision and keeps them all with nothing configured", async () => {
    const built = await build();

    const documentId = await writeFolders(built, 25);

    expect(await globalKeyframes(built, documentId)).toEqual([10, 20]);
  });

  it("writes at the type's interval and stays within its keep", async () => {
    const built = await build({
      default: { interval: 50 },
      types: { [DRIVE_TYPE]: { interval: 4, keep: 2 } },
    });

    const documentId = await writeFolders(built, 21);

    expect(await globalKeyframes(built, documentId)).toEqual([16, 20]);
  });

  it("keep 1: a cold head read after pruning has every folder", async () => {
    const built = await build({ default: { interval: 5, keep: 1 } });

    const documentId = await writeFolders(built, 18);
    expect(await globalKeyframes(built, documentId)).toEqual([15]);

    built.writeCache.invalidate(documentId);
    const head = await built.writeCache.getState(documentId, "global", "main");
    const historical = await built.writeCache.getState(
      documentId,
      "global",
      "main",
      7,
    );

    const nodes = (document: typeof head) =>
      (document as DocumentDriveDocument).state.global.nodes;
    expect(nodes(head)).toHaveLength(18);
    expect(nodes(historical)).toHaveLength(8);
    expect(await globalKeyframes(built, documentId)).toEqual([15]);
  });

  it("a historical read adds no keyframe", async () => {
    const built = await build({ default: { interval: 5 } });
    const documentId = await writeFolders(built, 12);
    await built.keyframeStore.deleteKeyframes(documentId, "global", "main");

    built.writeCache.invalidate(documentId);
    await built.writeCache.getState(documentId, "global", "main", 10);
    await built.writeCache.getState(documentId, "global", "main", 5);

    expect(await globalKeyframes(built, documentId)).toEqual([]);
  });

  it("cleans up what an earlier rule left behind, and reads stay whole", async () => {
    const built = await build({ default: { interval: 50, keep: 2 } });
    const documentId = await writeFolders(built, 12);
    for (const revision of [2, 4, 6, 8, 10]) {
      await built.keyframeStore.putKeyframe(
        documentId,
        "global",
        "main",
        revision,
        await built.writeCache.getState(documentId, "global", "main", revision),
      );
    }

    built.keyframeCleanup.start({ dryRun: false });
    await vi.waitFor(
      () => {
        expect(built.keyframeCleanup.status()?.state).toBe("done");
      },
      { timeout: 10_000 },
    );

    expect(await globalKeyframes(built, documentId)).toEqual([8, 10]);
    built.writeCache.invalidate(documentId);
    const head = await built.writeCache.getState(documentId, "global", "main");
    const before = await built.writeCache.getState(
      documentId,
      "global",
      "main",
      3,
    );
    expect((head as DocumentDriveDocument).state.global.nodes).toHaveLength(12);
    expect((before as DocumentDriveDocument).state.global.nodes).toHaveLength(
      4,
    );
  });
});
