import { resolveMemoryTelemetryConfig } from "@powerhousedao/reactor";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHeapSnapshotWriter } from "../../src/telemetry/heap-snapshot.js";
import {
  fileTimestamp,
  JsonlFile,
  memoryFileSink,
} from "../../src/telemetry/jsonl-sink.js";
import { NodeMemorySampler } from "../../src/telemetry/node-memory-sampler.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ph-telemetry-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("NodeMemorySampler", () => {
  it("reports the process and needs no start", () => {
    const sample = new NodeMemorySampler().sample();
    expect(sample.rss).toBeGreaterThan(0);
    expect(sample.heapUsed).toBeGreaterThan(0);
    expect(sample.maxRss).toBeGreaterThan(0);
    expect(sample.spaces.old).toBeGreaterThan(0);
    expect(sample.contexts.native).toBeGreaterThan(0);
    expect(sample.freemem).toBeGreaterThan(0);
    expect(sample.postGcHeap).toBeNull();
  });

  it("starts and stops its observers", () => {
    const sampler = new NodeMemorySampler();
    sampler.start();
    expect(sampler.sample().loop.p50).toBeGreaterThanOrEqual(0);
    sampler.stop();
    sampler.stop();
  });
});

describe("JsonlFile", () => {
  const options = (file: string) => ({
    path: file,
    maxBytes: 200,
    keep: 3,
    header: { head: true },
  });

  it("starts with the header and appends a line per write", () => {
    const file = path.join(dir, "nested", "a.jsonl");
    const jsonl = new JsonlFile(options(file));
    jsonl.writeLine({ n: 1 });

    expect(
      readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as unknown),
    ).toEqual([{ head: true }, { n: 1 }]);
  });

  it("rotates past its size and keeps only the newest files", () => {
    const jsonl = new JsonlFile(options(path.join(dir, "a.jsonl")));
    for (let n = 0; n < 40; n++) jsonl.writeLine({ n, pad: "x".repeat(40) });

    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(3);
    expect(files).toContain("a.jsonl");
    const first = readFileSync(path.join(dir, "a.jsonl"), "utf8").split(
      "\n",
    )[0];
    expect(JSON.parse(first!)).toEqual({ head: true });
  });

  it("does not throw when the file cannot be written", () => {
    const logger = { warn: vi.fn() };
    const jsonl = new JsonlFile({
      ...options(path.join(dir, "a.jsonl")),
      logger: logger as never,
    });
    rmSync(dir, { recursive: true, force: true });
    expect(() => jsonl.writeLine({ n: 1 })).not.toThrow();
    expect(() => jsonl.writeLine({ n: 2 })).not.toThrow();
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe("memoryFileSink", () => {
  it("names the file for Windows, under the user data dir", () => {
    const sink = memoryFileSink(resolveMemoryTelemetryConfig(), {
      now: () => new Date("2026-10-30T14:05:00.000Z"),
      env: { PH_USER_DATA_DIR: dir },
    });
    expect(path.basename(sink.path)).toBe(
      `memory-2026-10-30T14-05-00-000Z-${process.pid}.jsonl`,
    );
    expect(sink.path.startsWith(path.join(dir, ".ph", "telemetry"))).toBe(true);

    const header = JSON.parse(
      readFileSync(sink.path, "utf8").split("\n")[0]!,
    ) as {
      telemetry: string;
      env?: unknown;
    };
    expect(header.telemetry).toBe("memory");
    expect(header.env).toBeUndefined();
  });

  it("honours an explicit path", () => {
    const file = path.join(dir, "chosen.jsonl");
    const sink = memoryFileSink(
      resolveMemoryTelemetryConfig({ filePath: file }),
    );
    expect(sink.path).toBe(file);
  });
});

describe("createHeapSnapshotWriter", () => {
  it("has no colon in its timestamps", () => {
    expect(fileTimestamp(new Date(0))).not.toMatch(/:/);
  });

  it("writes a real snapshot to an absolute path", async () => {
    const write = createHeapSnapshotWriter({ dir, freeMemory: () => Infinity });
    const file = await write(false);
    expect(path.isAbsolute(file)).toBe(true);
    expect(existsSync(file)).toBe(true);
  }, 60_000);

  it("refuses without room unless forced", async () => {
    const written = vi.fn((file: string) => file);
    const write = createHeapSnapshotWriter({
      dir,
      freeMemory: () => 100,
      heapUsed: () => 100,
      write: written,
    });
    await expect(write(false)).rejects.toThrow(/Too little free memory/);
    expect(written).not.toHaveBeenCalled();
    await expect(write(true)).resolves.toMatch(/\.heapsnapshot$/);
  });

  it("refuses a second snapshot within two minutes, forced or not", async () => {
    let now = 1_000_000;
    const write = createHeapSnapshotWriter({
      dir,
      now: () => now,
      freeMemory: () => Infinity,
      write: (file) => file,
    });
    await write(false);
    await expect(write(true)).rejects.toThrow(/two minutes/);
    now += 121_000;
    await expect(write(false)).resolves.toBeTruthy();
  });
});
