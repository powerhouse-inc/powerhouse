import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireStoreLocks,
  releaseStoreLocks,
  StoreInUseError,
} from "../src/store-lock.mjs";

const dirs: string[] = [];
function store(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-store-lock-"));
  dirs.push(root);
  return path.join(root, "reactor-storage");
}
afterEach(() => {
  releaseStoreLocks();
  for (const d of dirs.splice(0))
    fs.rmSync(d, { recursive: true, force: true });
});

const lockOf = (dir: string) => `${path.resolve(dir)}.lock`;
const lockPid = (dir: string) =>
  (JSON.parse(fs.readFileSync(lockOf(dir), "utf8")) as { pid: number }).pid;
const claim = (dir: string, pid: number) =>
  fs.writeFileSync(
    lockOf(dir),
    JSON.stringify({ pid, startedAt: "earlier", command: "ph run vetra" }),
  );

describe("acquireStoreLocks", () => {
  it("writes a sibling lock (never inside the data dir) and releases it", () => {
    const dir = store();
    acquireStoreLocks([dir]);
    expect(lockPid(dir)).toBe(process.pid);
    expect(fs.existsSync(dir)).toBe(false); // initdb still gets an empty dir
    releaseStoreLocks();
    expect(fs.existsSync(lockOf(dir))).toBe(false);
  });

  it("refuses a store held by another live process, naming it", () => {
    const dir = store();
    claim(dir, 4242);
    expect(() => acquireStoreLocks([dir], (pid) => pid === 4242)).toThrow(
      StoreInUseError,
    );
    expect(() => acquireStoreLocks([dir], (pid) => pid === 4242)).toThrow(
      /pid 4242.*ph run vetra/,
    );
  });

  it("takes over a stale lock from a dead (hard-killed) process", () => {
    const dir = store();
    claim(dir, 4242);
    acquireStoreLocks([dir], () => false);
    expect(lockPid(dir)).toBe(process.pid);
  });

  it("is re-entrant for the owning process (in-process restarts)", () => {
    const dir = store();
    acquireStoreLocks([dir]);
    expect(() => acquireStoreLocks([dir])).not.toThrow();
  });
});
