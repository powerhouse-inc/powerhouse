import { describe, expect, it } from "vitest";
import type {
  CatchUpConsumerStatus,
  CatchUpStatus,
} from "../../src/catch-up/types.js";
import {
  computeProgress,
  PROCESSOR_MANAGER_CONSUMER_ID,
} from "../../src/inspector/progress.js";
import type { InspectorProcessorInfo } from "../../src/inspector/types.js";

function processor(
  fields: Partial<InspectorProcessorInfo> & { processorId: string },
): InspectorProcessorInfo {
  const [factoryId = "f", driveId = "drive", index = "0"] =
    fields.processorId.split(":");
  return {
    factoryId,
    driveId,
    processorIndex: Number(index),
    lastOrdinal: 0,
    status: "active",
    lastError: undefined,
    lastErrorTimestamp: undefined,
    floor: 0,
    clearable: false,
    runFrom: 0,
    phase: "live",
    ...fields,
  };
}

function consumer(
  consumerId: string,
  appliedThrough: number,
  extra: Partial<CatchUpConsumerStatus> = {},
): CatchUpConsumerStatus {
  return {
    consumerId,
    thread: "host",
    appliedThrough,
    trackedAbove: 0,
    lastAdvanceUtcMs: 0,
    ...extra,
  };
}

function status(
  head: number,
  consumers: CatchUpConsumerStatus[] = [],
): CatchUpStatus {
  return {
    watermark: { head, settledThrough: head, waitingOn: [] },
    consumers,
  };
}

describe("computeProgress", () => {
  it("returns nothing for empty input", () => {
    expect(computeProgress([], undefined)).toEqual({
      head: 0,
      headKnown: false,
      factories: [],
      readModels: [],
    });
    expect(computeProgress([], status(10))).toMatchObject({
      head: 10,
      headKnown: true,
      factories: [],
      readModels: [],
    });
  });

  it("measures a replay from its run start to the head", () => {
    const progress = computeProgress(
      [
        processor({
          processorId: "f:a:0",
          runFrom: 100,
          lastOrdinal: 130,
          phase: "catching-up",
        }),
      ],
      status(200),
    );

    expect(progress.factories).toEqual([
      {
        factoryId: "f",
        label: "f",
        driveCount: 1,
        phase: "catching-up",
        done: 30,
        total: 100,
        fraction: 0.3,
        processors: [
          {
            processorId: "f:a:0",
            driveId: "a",
            processorIndex: 0,
            phase: "catching-up",
            runFrom: 100,
            lastOrdinal: 130,
            done: 30,
            total: 100,
            fraction: 0.3,
          },
        ],
      },
    ]);
  });

  it("counts a live processor as complete whatever its lag", () => {
    const [factory] = computeProgress(
      [processor({ processorId: "f:a:0", runFrom: 90, lastOrdinal: 90 })],
      status(100),
    ).factories;

    expect(factory).toMatchObject({
      phase: "live",
      done: 0,
      total: 0,
      fraction: 1,
    });
  });

  it("names a factory by the last segment of a project path or package id", () => {
    const { factories } = computeProgress(
      [
        processor({ processorId: "a", factoryId: "D:\\work\\sektar" }),
        processor({ processorId: "b", factoryId: "/home/me/projects/ledger/" }),
        processor({ processorId: "c", factoryId: "@powerhousedao/vetra" }),
        processor({ processorId: "d", factoryId: "plain" }),
      ],
      status(10),
    );

    expect(factories.map((f) => [f.factoryId, f.label])).toEqual([
      ["@powerhousedao/vetra", "vetra"],
      ["/home/me/projects/ledger/", "ledger"],
      ["D:\\work\\sektar", "sektar"],
      ["plain", "plain"],
    ]);
  });

  it("shows a queued replay at the head as not started, not as done", () => {
    const { factories } = computeProgress(
      [
        processor({
          processorId: "f:a:0",
          runFrom: 40,
          lastOrdinal: 40,
          phase: "catching-up",
        }),
      ],
      status(40),
    );

    expect(factories[0]!.processors[0]!.fraction).toBe(0);
    expect(factories[0]!.fraction).toBe(0);
  });

  it("treats a head below the run start as nothing left to scan", () => {
    const [factory] = computeProgress(
      [
        processor({
          processorId: "f:a:0",
          runFrom: 50,
          lastOrdinal: 50,
          phase: "catching-up",
        }),
      ],
      status(40),
    ).factories;

    expect(factory!.processors[0]).toMatchObject({
      done: 0,
      total: 0,
      fraction: 1,
    });
  });

  it("clamps a cursor parked below its run start, or past the head", () => {
    const [factory] = computeProgress(
      [
        processor({
          processorId: "f:a:0",
          runFrom: 50,
          lastOrdinal: 20,
          phase: "catching-up",
        }),
        processor({
          processorId: "f:b:0",
          runFrom: 50,
          lastOrdinal: 120,
          phase: "catching-up",
        }),
      ],
      status(100),
    ).factories;

    expect(factory!.processors.map((row) => [row.done, row.fraction])).toEqual([
      [0, 0],
      [50, 1],
    ]);
    expect(factory).toMatchObject({ done: 50, total: 100, fraction: 0.5 });
  });

  it("keeps an errored processor where it stopped and marks its factory errored", () => {
    const [factory] = computeProgress(
      [
        processor({
          processorId: "f:a:0",
          runFrom: 0,
          lastOrdinal: 25,
          status: "errored",
          phase: "errored",
        }),
        processor({
          processorId: "f:b:0",
          runFrom: 0,
          lastOrdinal: 50,
          phase: "catching-up",
        }),
      ],
      status(100),
    ).factories;

    expect(factory).toMatchObject({
      phase: "errored",
      done: 75,
      total: 200,
      fraction: 0.375,
    });
    expect(factory!.processors[0]).toMatchObject({
      phase: "errored",
      fraction: 0.25,
    });
  });

  it("sums a factory across many drives, sorted by factory and drive", () => {
    const drives = ["d3", "d1", "d2", "d1"];
    const infos = drives.map((driveId, index) =>
      processor({
        processorId: `sektar:${driveId}:${index}`,
        runFrom: 0,
        lastOrdinal: 10 * (index + 1),
        phase: "catching-up",
      }),
    );
    infos.push(
      processor({ processorId: "alpha:d1:0", runFrom: 100, lastOrdinal: 100 }),
    );

    const { factories } = computeProgress(infos, status(100));

    expect(factories.map((factory) => factory.factoryId)).toEqual([
      "alpha",
      "sektar",
    ]);
    const sektar = factories[1]!;
    expect(sektar).toMatchObject({
      driveCount: 3,
      phase: "catching-up",
      done: 100,
      total: 400,
      fraction: 0.25,
    });
    expect(
      sektar.processors.map((row) => `${row.driveId}:${row.processorIndex}`),
    ).toEqual(["d1:1", "d1:3", "d2:2", "d3:0"]);
    expect(factories[0]).toMatchObject({ phase: "live", fraction: 1 });
  });

  it("takes the highest cursor as the head without a catch-up status", () => {
    const progress = computeProgress(
      [
        processor({
          processorId: "f:a:0",
          runFrom: 0,
          lastOrdinal: 20,
          phase: "catching-up",
        }),
        processor({ processorId: "f:b:0", runFrom: 80, lastOrdinal: 80 }),
      ],
      undefined,
    );

    expect(progress).toMatchObject({ head: 80, headKnown: false });
    expect(progress.factories[0]).toMatchObject({ done: 20, total: 80 });
  });

  it("gives each read model a row and leaves out the processor manager", () => {
    const { readModels } = computeProgress(
      [],
      status(200, [
        consumer("document-view", 200),
        consumer(PROCESSOR_MANAGER_CONSUMER_ID, 10),
        consumer("document-indexer", 50, {
          thread: "projection",
          blockedAt: {
            ordinal: 51,
            documentId: "doc",
            scope: "global",
            branch: "main",
            type: "SET",
            error: "boom",
          },
        }),
        consumer("ahead", 250),
      ]),
    );

    expect(readModels).toEqual([
      {
        consumerId: "document-view",
        thread: "host",
        appliedThrough: 200,
        head: 200,
        fraction: 1,
        complete: true,
        blocked: false,
      },
      {
        consumerId: "document-indexer",
        thread: "projection",
        appliedThrough: 50,
        head: 200,
        fraction: 0.25,
        complete: false,
        blocked: true,
      },
      {
        consumerId: "ahead",
        thread: "host",
        appliedThrough: 250,
        head: 200,
        fraction: 1,
        complete: true,
        blocked: false,
      },
    ]);
  });

  it("reads a read model as complete on an empty store", () => {
    const { readModels } = computeProgress(
      [],
      status(0, [consumer("document-view", 0)]),
    );

    expect(readModels[0]).toMatchObject({ fraction: 1, complete: true });
  });
});
