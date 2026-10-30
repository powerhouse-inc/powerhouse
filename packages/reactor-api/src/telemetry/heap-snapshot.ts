import { mkdirSync } from "node:fs";
import { freemem } from "node:os";
import path from "node:path";
import { writeHeapSnapshot } from "node:v8";
import { fileTimestamp } from "./jsonl-sink.js";

const COOLDOWN_MS = 120_000;
/** Writing a snapshot needs memory close to the heap's size. */
const FREE_MEMORY_FACTOR = 1.5;

export type HeapSnapshotOptions = {
  dir: string;
  now?: () => number;
  freeMemory?: () => number;
  heapUsed?: () => number;
  write?: (file: string) => string;
};

/**
 * A guarded writer of main-thread heap snapshots: one at a time, at most one
 * every two minutes, and refused without room for it unless forced. A snapshot
 * can hold document state, so it stays on the host. It blocks the event loop
 * for seconds to minutes; take it at 2-4 GB, not at 10 GB.
 */
export function createHeapSnapshotWriter(
  options: HeapSnapshotOptions,
): (force: boolean) => Promise<string> {
  const now = options.now ?? (() => Date.now());
  const freeMemory = options.freeMemory ?? freemem;
  const heapUsed = options.heapUsed ?? (() => process.memoryUsage().heapUsed);
  const write = options.write ?? ((file) => writeHeapSnapshot(file));
  let writing = false;
  let lastAt: number | undefined;

  return (force) => {
    if (writing) {
      return Promise.reject(
        new Error("A heap snapshot is already being written"),
      );
    }
    if (lastAt !== undefined && now() - lastAt < COOLDOWN_MS) {
      return Promise.reject(
        new Error("A heap snapshot was written in the last two minutes"),
      );
    }
    const needed = FREE_MEMORY_FACTOR * heapUsed();
    if (!force && freeMemory() < needed) {
      return Promise.reject(
        new Error(
          `Too little free memory for a heap snapshot: ${Math.round(freeMemory() / 1048576)} MB free, ${Math.round(needed / 1048576)} MB needed; force overrides this`,
        ),
      );
    }
    writing = true;
    try {
      mkdirSync(options.dir, { recursive: true });
      const stamp = fileTimestamp(new Date(now()));
      const file = path.resolve(
        options.dir,
        `heap-${stamp}-${process.pid}.heapsnapshot`,
      );
      const written = write(file);
      lastAt = now();
      return Promise.resolve(written);
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      writing = false;
    }
  };
}
