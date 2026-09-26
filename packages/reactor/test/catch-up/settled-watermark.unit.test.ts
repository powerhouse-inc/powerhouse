import { ConsoleLogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import {
  parseSnapshot,
  ProbeSettler,
  SettledWatermark,
  snapshotFunctionsFor,
  type ProbeReading,
} from "../../src/catch-up/settled-watermark.js";

function reading(
  head: number,
  snapshot: string,
  outsideWrite = true,
): ProbeReading {
  return { head, snapshot: parseSnapshot(snapshot), outsideWrite };
}

function watermarkOver(readings: ProbeReading[]) {
  const logger = new ConsoleLogger(["test"]);
  const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
  const probe = vi.fn(() => {
    const next = readings.shift();
    if (next === undefined) throw new Error("no more readings");
    return Promise.resolve(next);
  });
  return { watermark: new SettledWatermark(probe, logger), probe, warn };
}

describe("ProbeSettler", () => {
  it.each([
    {
      name: "empty xip settles its own head",
      probes: [{ head: 5, snapshot: "100:100:" }],
      settled: [5],
    },
    {
      name: "open xid holds the probe",
      probes: [{ head: 5, snapshot: "100:103:100,102" }],
      settled: [0],
    },
    {
      name: "a later xmin at the open max still holds",
      probes: [
        { head: 5, snapshot: "100:103:100,102" },
        { head: 6, snapshot: "102:104:102" },
      ],
      settled: [0, 0],
    },
    {
      name: "a later xmin past the open max settles the earlier head",
      probes: [
        { head: 5, snapshot: "100:103:100,102" },
        { head: 8, snapshot: "103:105:103" },
      ],
      settled: [0, 5],
    },
    {
      name: "an empty later probe settles itself and everything below",
      probes: [
        { head: 5, snapshot: "100:103:100,102" },
        { head: 9, snapshot: "105:105:" },
      ],
      settled: [0, 9],
    },
    {
      name: "never moves backwards",
      probes: [
        { head: 9, snapshot: "100:100:" },
        { head: 4, snapshot: "101:101:" },
      ],
      settled: [9, 9],
    },
  ])("$name", ({ probes, settled }) => {
    const settler = new ProbeSettler();
    const seen = probes.map(({ head, snapshot }) =>
      settler.observe(head, parseSnapshot(snapshot), 0),
    );
    expect(seen).toEqual(settled);
  });

  it("names the xids an unsettled probe waits on", () => {
    const settler = new ProbeSettler();
    settler.observe(5, parseSnapshot("100:103:100,102"), 1000);
    settler.observe(6, parseSnapshot("102:104:102"), 2000);
    expect(settler.waitingOn()).toEqual(["102"]);
    expect(settler.stalledSinceUtcMs()).toBe(1000);
  });

  it("drops the oldest probe past the pending limit, only delaying settlement", () => {
    const settler = new ProbeSettler();
    for (let head = 1; head <= 70; head++) {
      settler.observe(head, parseSnapshot("10:11:10"), 0);
    }
    expect(settler.settledThrough).toBe(0);
    expect(settler.observe(71, parseSnapshot("11:11:"), 0)).toBe(71);
  });
});

describe("SettledWatermark", () => {
  it("settles a probe with no open transaction at its own head", async () => {
    const { watermark } = watermarkOver([reading(12, "500:500:")]);
    expect(await watermark.refresh()).toBe(12);
    expect(watermark.settledThrough).toBe(12);
    expect(watermark.status()).toMatchObject({
      head: 12,
      settledThrough: 12,
      waitingOn: [],
    });
  });

  it("holds a probe until xmin passes its highest open xid", async () => {
    const { watermark } = watermarkOver([
      reading(3, "40:40:"),
      reading(10, "40:45:41,44"),
      reading(11, "44:46:44"),
      reading(11, "45:46:"),
    ]);
    const advanced: number[] = [];
    watermark.onAdvance((through) => advanced.push(through));

    expect(await watermark.refresh()).toBe(3);
    expect(await watermark.refresh()).toBe(3);
    expect(watermark.status().waitingOn).toEqual(["41", "44"]);
    expect(watermark.status().stalledSinceUtcMs).toBeTypeOf("number");
    expect(await watermark.refresh()).toBe(3);
    expect(await watermark.refresh()).toBe(11);
    expect(advanced).toEqual([3, 11]);
  });

  it("discards a probe taken inside a write transaction", async () => {
    const { watermark, warn } = watermarkOver([
      reading(20, "70:70:", false),
      reading(21, "70:70:", false),
      reading(22, "71:71:"),
    ]);
    expect(await watermark.refresh()).toBe(0);
    expect(await watermark.refresh()).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(await watermark.refresh()).toBe(22);
  });

  it("coalesces refreshes behind one in flight", async () => {
    let resolveFirst!: (reading: ProbeReading) => void;
    const logger = new ConsoleLogger(["test"]);
    const probe = vi
      .fn<() => Promise<ProbeReading>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(reading(9, "3:3:"));
    const watermark = new SettledWatermark(probe, logger);

    const first = watermark.refresh();
    const second = watermark.refresh();
    const third = watermark.refresh();
    expect(second).toBe(third);
    resolveFirst(reading(4, "2:2:"));

    expect(await first).toBe(4);
    expect(await second).toBe(9);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("uses txid functions below server version 13", () => {
    expect(snapshotFunctionsFor(120_015)).toEqual({
      snapshot: "txid_current_snapshot",
      currentXid: "txid_current",
      xidIfAssigned: "txid_current_if_assigned",
    });
    expect(snapshotFunctionsFor(100_000).snapshot).toBe(
      "txid_current_snapshot",
    );
    expect(snapshotFunctionsFor(130_000)).toEqual({
      snapshot: "pg_current_snapshot",
      currentXid: "pg_current_xact_id",
      xidIfAssigned: "pg_current_xact_id_if_assigned",
    });
    expect(() => snapshotFunctionsFor(96_000)).toThrow(/not supported/);
  });
});
