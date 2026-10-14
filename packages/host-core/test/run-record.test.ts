import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearRunRecord,
  isPidAlive,
  probeRun,
  readRunRecord,
  writeRunRecord,
  type RunRecord,
} from "../src/run-record.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-run-record-"));
  temporary.push(dir);
  return dir;
}

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  pid: process.pid,
  hostName: "vetra",
  projectName: "lab",
  startedAt: "2026-10-13T00:00:00.000Z",
  members: {
    "vetra-studio": { port: 2064 },
    "vetra-switchboard": { port: 7064 },
  },
  ...over,
});

describe("run record read/write/clear", () => {
  it("round-trips a record under .ph/run/<host>.json", () => {
    const dir = makeProject();
    writeRunRecord(dir, record());
    expect(existsSync(path.join(dir, ".ph/run/vetra.json"))).toBe(true);
    expect(readRunRecord(dir, "vetra")).toMatchObject({
      hostName: "vetra",
      members: { "vetra-studio": { port: 2064 } },
    });
  });

  it("keeps hosts separate by name", () => {
    const dir = makeProject();
    writeRunRecord(dir, record({ hostName: "vetra" }));
    writeRunRecord(dir, record({ hostName: "desktop", members: {} }));
    expect(readRunRecord(dir, "vetra")?.hostName).toBe("vetra");
    expect(readRunRecord(dir, "desktop")?.hostName).toBe("desktop");
  });

  it("returns undefined for missing or corrupt records", () => {
    const dir = makeProject();
    expect(readRunRecord(dir, "nope")).toBeUndefined();
  });

  it("clear removes the record and is idempotent", () => {
    const dir = makeProject();
    writeRunRecord(dir, record());
    clearRunRecord(dir, "vetra");
    expect(readRunRecord(dir, "vetra")).toBeUndefined();
    expect(() => clearRunRecord(dir, "vetra")).not.toThrow();
  });
});

describe("isPidAlive", () => {
  it("reports the current process alive and a bogus pid dead", () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(2147483646)).toBe(false);
  });
});

describe("probeRun", () => {
  it("none when no record", () => {
    expect(probeRun(makeProject(), "vetra", "lab")).toEqual({ status: "none" });
  });

  it("live when pid alive and project matches", () => {
    const dir = makeProject();
    writeRunRecord(dir, record());
    expect(probeRun(dir, "vetra", "lab").status).toBe("live");
  });

  it("foreign when pid alive but project differs", () => {
    const dir = makeProject();
    writeRunRecord(dir, record({ projectName: "other" }));
    expect(probeRun(dir, "vetra", "lab").status).toBe("foreign");
  });

  it("stale when the recorded pid is dead", () => {
    const dir = makeProject();
    writeRunRecord(dir, record({ pid: 2147483646 }));
    const probe = probeRun(dir, "vetra", "lab");
    expect(probe.status).toBe("stale");
  });
});
