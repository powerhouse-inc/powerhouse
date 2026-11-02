import type { DocumentModelDocument } from "@powerhousedao/shared/document-model";
import {
  addModule,
  baseReducerVersion,
  deriveScope,
  documentModelStateReducer,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  createBaseReducer3Document,
  createDocModelDocument,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import {
  assertOneRuleAgreement,
  seedLongStream,
  storedRows,
  timeColdRebuild,
} from "./one-rule-agreement.js";

let module: InProcessReactorModule | undefined;

afterEach(() => {
  module?.reactor.kill();
  module = undefined;
});

async function settled(jobId: string): Promise<string | undefined> {
  await vi.waitUntil(
    async () => {
      const { status } = await module!.reactor.getJobStatus(jobId);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    },
    { timeout: 10_000 },
  );
  const job = await module!.reactor.getJobStatus(jobId);
  return job.status === JobStatus.FAILED
    ? (job.error?.message ?? "failed")
    : undefined;
}

describe("base-reducer 2", () => {
  // A stream without skips or RETRACTs applies whole under either rule.
  it("the one-rule harness agrees on a stream without undo", async () => {
    module = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withWriteCacheConfig({ keyframeInterval: 2 })
      .buildModule();
    const document = createDocModelDocument({
      signaturePolicy: "legacy",
      protocolVersions: { "base-reducer": 2 },
    });
    const docId = document.header.id;
    expect(await settled((await module.reactor.create(document)).id)).toBe(
      undefined,
    );
    for (const id of ["a", "b", "c"]) {
      const job = await module.reactor.execute(docId, "main", [
        addModule({ id, name: id }),
      ]);
      expect(await settled(job.id)).toBeUndefined();
    }

    const { expected } = await assertOneRuleAgreement({ module, document });
    expect(
      (expected as DocumentModelDocument["state"]["global"]).specifications[0]
        .modules,
    ).toHaveLength(3);
  });
});

describe("base-reducer 3", () => {
  it("rebuilds a long stream in time linear in its rows", async () => {
    const times: Record<number, number> = {};
    for (const count of [1000, 4000]) {
      module?.reactor.kill();
      module = await createUndoV3ReactorBuilder().buildModule();
      const document = createBaseReducer3Document({
        signaturePolicy: "legacy",
      });
      const docId = document.header.id;
      expect(baseReducerVersion(document.header)).toBe(3);
      expect(await settled((await module.reactor.create(document)).id)).toBe(
        undefined,
      );
      await seedLongStream(module, document, count);

      const rows = await storedRows(module, docId);
      expect(rows).toHaveLength(count);
      module.writeCache.invalidate(docId);
      const rebuilt = await module.writeCache.getState(docId, "global", "main");
      const derived = deriveScope(
        document,
        rows,
        () => documentModelStateReducer as never,
      ).document;
      expect((rebuilt as DocumentModelDocument).state.global).toEqual(
        (derived as DocumentModelDocument).state.global,
      );

      times[count] = await timeColdRebuild(module, docId);
    }

    // Quadratic would be about 16 times; the floor absorbs timer noise.
    const [short, long] = [times[1000], times[4000]];
    expect(
      long,
      `1k rows: ${short.toFixed(1)}ms, 4k rows: ${long.toFixed(1)}ms`,
    ).toBeLessThan(10 * Math.max(short, 25));
  }, 120_000);
});
