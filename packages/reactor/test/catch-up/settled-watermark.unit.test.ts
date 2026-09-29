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
  xid: number | null,
  snapshot: string,
  outsideWrite = true,
): ProbeReading {
  return {
    head,
    xid: xid === null ? null : BigInt(xid),
    snapshot: parseSnapshot(snapshot),
    outsideWrite,
  };
}

function watermarkOver(readings: ProbeReading[]) {
  const logger = new ConsoleLogger(["test"]);
  const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
  const probe = vi.fn((_probedHead: number) => {
    const next = readings.shift();
    if (next === undefined) throw new Error("no more readings");
    return Promise.resolve(next);
  });
  return { watermark: new SettledWatermark(probe, logger), probe, warn };
}

describe("ProbeSettler", () => {
  it.each([
    {
      name: "a snapshot past its own xid settles its head",
      probes: [{ head: 5, xid: 100, snapshot: "101:101:" }],
      settled: [5],
    },
    {
      name: "an open xid below its own holds it",
      probes: [{ head: 5, xid: 103, snapshot: "100:104:100,102" }],
      settled: [0],
    },
    {
      name: "an empty xip whose xmin is below its own xid holds it",
      probes: [{ head: 5, xid: 8330, snapshot: "8329:8329:" }],
      settled: [0],
    },
    {
      name: "an xmin at its own xid still holds",
      probes: [
        { head: 5, xid: 103, snapshot: "100:104:100" },
        { head: 6, xid: 104, snapshot: "103:105:103" },
      ],
      settled: [0, 0],
    },
    {
      name: "a later xmin past its xid settles the earlier head",
      probes: [
        { head: 5, xid: 103, snapshot: "100:104:100,102" },
        { head: 8, xid: 105, snapshot: "104:106:104" },
      ],
      settled: [0, 5],
    },
    {
      name: "a later snapshot with nothing open settles everything below",
      probes: [
        { head: 5, xid: 103, snapshot: "100:104:100" },
        { head: 9, xid: 105, snapshot: "106:106:" },
      ],
      settled: [0, 9],
    },
    {
      name: "a head already probed settles on a snapshot alone",
      probes: [
        { head: 5, xid: 103, snapshot: "100:104:100" },
        { head: 5, xid: null, snapshot: "104:104:" },
      ],
      settled: [0, 5],
    },
    {
      name: "a head without an xid is not covered",
      probes: [{ head: 5, xid: null, snapshot: "100:100:" }],
      settled: [0],
    },
    {
      name: "never moves backwards",
      probes: [
        { head: 9, xid: 100, snapshot: "101:101:" },
        { head: 4, xid: 101, snapshot: "102:102:" },
      ],
      settled: [9, 9],
    },
  ])("$name", ({ probes, settled }) => {
    const settler = new ProbeSettler();
    const seen = probes.map(({ head, xid, snapshot }) =>
      settler.observe(
        head,
        xid === null ? null : BigInt(xid),
        parseSnapshot(snapshot),
        0,
      ),
    );
    expect(seen).toEqual(settled);
  });

  it("covers only heads it took an xid for", () => {
    const settler = new ProbeSettler();
    settler.observe(5, null, parseSnapshot("100:100:"), 0);
    expect(settler.probedHead).toBe(0);
    expect(settler.head).toBe(5);
    settler.observe(5, 100n, parseSnapshot("100:101:100"), 0);
    expect(settler.probedHead).toBe(5);
  });

  it("names the xids an unsettled probe waits on", () => {
    const settler = new ProbeSettler();
    settler.observe(5, 103n, parseSnapshot("100:104:100,102"), 1000);
    settler.observe(6, 105n, parseSnapshot("102:106:102"), 2000);
    expect(settler.waitingOn()).toEqual(["102"]);
    expect(settler.stalledSinceUtcMs()).toBe(1000);
  });

  it("drops the oldest probe past the pending limit, only delaying settlement", () => {
    const settler = new ProbeSettler();
    for (let head = 1; head <= 70; head++) {
      settler.observe(head, BigInt(100 + head), parseSnapshot("10:200:10"), 0);
    }
    expect(settler.settledThrough).toBe(0);
    expect(settler.observe(71, 171n, parseSnapshot("172:172:"), 0)).toBe(71);
  });
});

describe("SettledWatermark", () => {
  it("settles a probe with no open transaction at its own head", async () => {
    const { watermark } = watermarkOver([reading(12, 500, "501:501:")]);
    expect(await watermark.refresh()).toBe(12);
    expect(watermark.settledThrough).toBe(12);
    expect(watermark.status()).toMatchObject({
      head: 12,
      settledThrough: 12,
      waitingOn: [],
    });
  });

  it("holds a probe until xmin passes its own xid", async () => {
    const { watermark, probe } = watermarkOver([
      reading(3, 40, "41:41:"),
      reading(10, 45, "41:46:41,44"),
      reading(11, 46, "44:47:44"),
      reading(11, null, "47:47:"),
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
    expect(probe.mock.calls.map(([probedHead]) => probedHead)).toEqual([
      0, 3, 10, 11,
    ]);
  });

  it("discards a probe taken inside a write transaction", async () => {
    const { watermark, warn } = watermarkOver([
      reading(20, null, "70:70:", false),
      reading(21, null, "70:70:", false),
      reading(22, 71, "72:72:"),
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
      .mockResolvedValueOnce(reading(9, 3, "4:4:"));
    const watermark = new SettledWatermark(probe, logger);

    const first = watermark.refresh();
    const second = watermark.refresh();
    const third = watermark.refresh();
    expect(second).toBe(third);
    resolveFirst(reading(4, 2, "3:3:"));

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
