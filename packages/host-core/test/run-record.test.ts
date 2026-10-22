import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

const member = (host: string, port: number) => ({
  host,
  runnerModule: "fake-runner",
  kind: "reactor" as const,
  verb: "dev",
  outputs: { port },
});

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  version: 2,
  host: "vetra",
  projectName: "lab",
  kind: "compound",
  verb: "dev",
  pid: process.pid,
  startedAt: "2026-10-13T00:00:00.000Z",
  members: {
    "vetra-studio": member("connect", 2064),
    "vetra-switchboard": member("switchboard", 7064),
  },
  ...over,
});

describe("run record read/write/clear", () => {
  it("round-trips a record under .ph/run/<host>.json", () => {
    const dir = makeProject();
    writeRunRecord(dir, record());
    expect(existsSync(path.join(dir, ".ph/run/vetra.json"))).toBe(true);
    expect(readRunRecord(dir, "vetra")).toMatchObject({
      host: "vetra",
      members: { "vetra-studio": { outputs: { port: 2064 } } },
    });
  });

  it("keeps hosts separate by name", () => {
    const dir = makeProject();
    writeRunRecord(dir, record({ host: "vetra" }));
    writeRunRecord(dir, record({ host: "desktop", members: {} }));
    expect(readRunRecord(dir, "vetra")?.host).toBe("vetra");
    expect(readRunRecord(dir, "desktop")?.host).toBe("desktop");
  });

  it("reads a v1 record as not running (probe: none)", () => {
    const dir = makeProject();
    mkdirSync(path.join(dir, ".ph", "run"), { recursive: true });
    writeFileSync(
      path.join(dir, ".ph", "run", "vetra.json"),
      JSON.stringify({
        pid: process.pid,
        hostName: "vetra",
        projectName: "lab",
        startedAt: "x",
        members: {},
      }),
    );
    expect(readRunRecord(dir, "vetra")).toBeUndefined();
    expect(probeRun(dir, "vetra", "lab")).toEqual({ status: "none" });
  });

  it("refuses to write an invalid record", () => {
    const dir = makeProject();
    expect(() => writeRunRecord(dir, { ...record(), verb: "" })).toThrow();
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

describe("runRecordOutputSource", () => {
  it("hands the resolver the producer's outputsSchema, so an absent optional field omits its property", async () => {
    const { z } = await import("zod");
    const { runRecordOutputSource } = await import("../src/resolve/node.js");
    const { resolveHostOutputs } = await import("../src/resolve/resolve.js");
    const dir = makeProject();
    writeRunRecord(dir, {
      version: 2,
      host: "lab-switchboard",
      projectName: "lab",
      kind: "reactor",
      verb: "run",
      pid: process.pid,
      startedAt: "x",
      outputs: { origin: "http://localhost:4801" },
    });
    const outputsSchema = z.strictObject({
      origin: z.url(),
      mcp: z.url().optional(),
    });
    const source = runRecordOutputSource(dir, {
      consumer: "connect",
      projectName: "lab",
      producers: new Map([
        [
          "switchboard",
          {
            folder: "switchboard",
            name: "lab-switchboard",
            specifier: "fake-runner",
            runner: {
              kind: "reactor",
              run: () => Promise.resolve(undefined),
              hostSchema: {
                safeParse: (v: unknown) => ({ success: true, data: v }),
              },
              outputsSchema,
            },
          },
        ],
      ]),
    });
    const out = (p: string[]) => ({
      $output: { host: "switchboard", path: p },
    });
    expect(
      resolveHostOutputs(
        { origin: out(["origin"]), mcp: out(["mcp"]) },
        { outputs: source },
      ),
    ).toEqual({ origin: "http://localhost:4801" });
  });
});
