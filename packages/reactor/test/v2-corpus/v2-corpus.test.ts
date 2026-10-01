import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { baseReducerVersion } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { Corpus, RecordedReplica, RecordedScenario } from "./scenarios.js";
import {
  CORPUS_MODULES,
  CORPUS_PATH,
  SCENARIOS,
  globalState,
  operationsOf,
  recordScenario,
  replayDocumentState,
  scenarioDocument,
} from "./scenarios.js";

// Recorded on main before stage 1; see record.ts.
const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as Corpus;

/** Per-row reducer application with the stored skips. */
function replayed(scenario: RecordedScenario, replica: RecordedReplica) {
  let document = scenarioDocument(scenario);
  const protocolVersion = baseReducerVersion(document.header);
  for (const operation of operationsOf(document.header.id, replica.rows)) {
    document = CORPUS_MODULES[scenario.kind].reducer(
      document,
      operation.action,
      undefined,
      {
        skip: operation.skip,
        protocolVersion,
        replayOptions: { operation },
        skipIndexValidation: true,
      },
    );
  }
  return globalState(document);
}

async function settled(module: InProcessReactorModule, jobId: string) {
  await vi.waitUntil(async () => {
    const status = await module.reactor.getJobStatus(jobId);
    return (
      status.status === JobStatus.READ_READY ||
      status.status === JobStatus.FAILED
    );
  });
  const status = await module.reactor.getJobStatus(jobId);
  expect(status.error?.message ?? status.status).toBe(JobStatus.READ_READY);
}

describe("base-reducer 2", () => {
  describe("the v2 corpus", () => {
    it("holds every scenario the recorder drives", () => {
      expect(corpus.scenarios.map((scenario) => scenario.name)).toEqual(
        SCENARIOS.map((scenario) => scenario.name),
      );
    });

    describe.each(SCENARIOS.map((scenario) => [scenario.name, scenario]))(
      "%s",
      (name, scenario) => {
        const recorded = corpus.scenarios.find((entry) => entry.name === name)!;
        let module: InProcessReactorModule | undefined;

        afterEach(() => {
          module?.reactor.kill();
          module = undefined;
        });

        it("re-executes to the recorded rows and served state", async () => {
          expect(await recordScenario(scenario)).toEqual(recorded);
        });

        it("rebuilds the served state cold from the recorded rows", async () => {
          for (const replica of recorded.replicas) {
            module?.reactor.kill();
            module = await new ReactorBuilder()
              .withDocumentModelSources([
                documentModelDocumentModelModule as never,
                driveDocumentModelModule as never,
              ])
              .buildModule();
            const document = scenarioDocument(recorded);
            const docId = document.header.id;
            await settled(module, (await module.reactor.create(document)).id);

            await module.operationStore.apply(
              docId,
              document.header.documentType,
              "global",
              "main",
              0,
              (txn) => {
                txn.addOperations(...operationsOf(docId, replica.rows));
              },
            );
            module.writeCache.invalidate(docId, "global", "main");
            const rebuilt = await module.writeCache.getState(
              docId,
              "global",
              "main",
            );

            expect({
              replica: replica.name,
              state: globalState(rebuilt),
            }).toEqual({ replica: replica.name, state: replica.served });
          }
        });

        it("replays the recorded rows to the served state", () => {
          for (const replica of recorded.replicas) {
            expect({
              replica: replica.name,
              state: replayed(recorded, replica),
            }).toEqual({ replica: replica.name, state: replica.served });
          }
        });

        it("gives the recorded replayDocument state", () => {
          for (const replica of recorded.replicas) {
            expect({
              replica: replica.name,
              state: replayDocumentState(recorded, replica.rows),
            }).toEqual({
              replica: replica.name,
              state: replica.replayDocument,
            });
          }
        });
      },
    );
  });
});
