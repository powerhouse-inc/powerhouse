import {
  EventBus,
  ReactorBuilder,
  type InProcessReactorModule,
} from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import type { ILogger } from "document-model";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReactorKysely, resolveKeyframes } from "../src/server.mjs";

const LONG = 180_000;

function stubLogger(): ILogger {
  const logger = {
    level: "info",
    verbose: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    errorHandler: () => undefined,
    child: () => logger,
  };
  return logger as unknown as ILogger;
}

function emptyDocument() {
  return documentModelDocumentModelModule.utils.createDocument();
}

describe("resolveKeyframes", () => {
  const CONFIG = "/project/powerhouse.config.json";

  it("is unset with neither source, which keeps today's behaviour", () => {
    expect(resolveKeyframes(undefined, undefined, CONFIG)).toBeUndefined();
  });

  it("reads the project config", () => {
    expect(
      resolveKeyframes(undefined, { default: { keep: 4 } }, CONFIG),
    ).toEqual({ default: { keep: 4 } });
  });

  it("lets the configured rules win whole over the project config", () => {
    expect(
      resolveKeyframes(
        { default: { keep: 1 } },
        { default: { interval: 50 }, types: { "a/b": { keep: 9 } } },
        CONFIG,
      ),
    ).toEqual({ default: { keep: 1 } });
  });

  it("stops the boot on a project config it cannot use, naming the file", () => {
    expect(() =>
      resolveKeyframes(undefined, { default: { keep: 0 } }, CONFIG),
    ).toThrow(`${CONFIG} reactor.keyframes.default.keep`);
  });
});

describe("keyframe clean-up and reclaim on a reactor's own store", () => {
  let dataDir: string | undefined;
  let module: InProcessReactorModule | undefined;

  afterEach(async () => {
    await module?.shutdown();
    module = undefined;
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
    }
    dataDir = undefined;
  });

  it.each([
    ["in a worker thread", true],
    ["in the main thread", false],
  ])(
    "shrinks the table %s, after a dry run that left it alone",
    async (_where, pgliteWorkers) => {
      dataDir = await mkdtemp(join(tmpdir(), "ph-keyframe-reclaim-"));
      const storage = await createReactorKysely({
        reactorDbUrl: undefined,
        reactorPgliteDir: join(dataDir, "reactor"),
        reactorPgliteMajor: 17,
        inMemory: false,
        hostPoolSize: () => 1,
        pgliteWorkers,
        logger: stubLogger(),
      });
      expect(storage.storeMaintenance).toBeDefined();

      module = await new ReactorBuilder()
        .withEventBus(new EventBus())
        .withKysely(storage.kysely)
        .withKeyframes({ default: { keep: 1 } })
        .withStoreMaintenance(storage.storeMaintenance!)
        .buildModule();
      const { keyframeCleanup, keyframeStore } = module;

      const padded = emptyDocument();
      const large = {
        ...padded,
        state: { ...padded.state, padding: "x".repeat(200_000) },
      };
      for (let revision = 10; revision <= 100; revision += 10) {
        await keyframeStore.putKeyframe(
          "doc",
          "global",
          "main",
          revision,
          large,
        );
      }

      keyframeCleanup.start({ dryRun: true });
      await vi.waitFor(
        () => expect(keyframeCleanup.status()?.state).toBe("done"),
        { timeout: 30_000 },
      );
      expect(keyframeCleanup.status()?.totals.removableRows).toBe(9);
      expect(await keyframeStore.listKeyframes("doc")).toHaveLength(10);

      keyframeCleanup.start({ dryRun: false });
      await vi.waitFor(
        () => expect(keyframeCleanup.status()?.state).toBe("done"),
        { timeout: 30_000 },
      );
      const kept = await keyframeStore.listKeyframes("doc");
      expect(kept.map((row) => row.revision)).toEqual([100]);

      await keyframeCleanup.reclaim();
      await vi.waitFor(
        () =>
          expect(keyframeCleanup.reclaimStatus()?.state).not.toBe("running"),
        { timeout: 120_000, interval: 100 },
      );

      const reclaim = keyframeCleanup.reclaimStatus()!;
      expect(reclaim.message).toBe("The Keyframe table was rewritten.");
      expect(reclaim.state).toBe("done");
      expect(reclaim.tableBytesAfter).toBeLessThan(reclaim.tableBytesBefore!);

      const after = await keyframeStore.findNearestKeyframe(
        "doc",
        "global",
        "main",
        100,
      );
      expect(after?.revision).toBe(100);
    },
    LONG,
  );
});
