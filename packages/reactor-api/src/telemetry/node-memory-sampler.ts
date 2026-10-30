import type {
  IMemorySampler,
  ProcessMemorySample,
} from "@powerhousedao/reactor";
import { freemem } from "node:os";
import {
  constants,
  monitorEventLoopDelay,
  PerformanceObserver,
  type IntervalHistogram,
} from "node:perf_hooks";
import { getHeapSpaceStatistics, getHeapStatistics } from "node:v8";

type GcEntry = PerformanceEntry & { detail?: { kind?: number } };

const LOOP_RESOLUTION_MS = 20;
const NANOS_PER_MS = 1_000_000;

function spaceBytes(name: string): number {
  return (
    getHeapSpaceStatistics().find((space) => space.space_name === name)
      ?.space_used_size ?? 0
  );
}

/**
 * Reads the process's memory. `heapUsed` alone saw-tooths, so a GC observer
 * keeps the used heap right after each major collection, which needs no
 * `--expose-gc`.
 */
export class NodeMemorySampler implements IMemorySampler {
  private observer: PerformanceObserver | undefined;
  private loop: IntervalHistogram | undefined;
  private postGcHeap: number | null = null;
  private postGcAt: string | null = null;

  start(): void {
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const { detail } = entry as GcEntry;
        if (detail?.kind === constants.NODE_PERFORMANCE_GC_MAJOR) {
          this.postGcHeap = getHeapStatistics().used_heap_size;
          this.postGcAt = new Date().toISOString();
        }
      }
    });
    this.observer.observe({ entryTypes: ["gc"] });
    this.loop = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
    this.loop.enable();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.loop?.disable();
    this.loop = undefined;
  }

  sample(): ProcessMemorySample {
    const memory = process.memoryUsage();
    const heap = getHeapStatistics();
    const loop = {
      p50: (this.loop?.percentile(50) ?? 0) / NANOS_PER_MS,
      p99: (this.loop?.percentile(99) ?? 0) / NANOS_PER_MS,
    };
    this.loop?.reset();
    return {
      rss: memory.rss,
      maxRss: process.resourceUsage().maxRSS * 1024,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      heapLimit: heap.heap_size_limit,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
      mallocedMemory: heap.malloced_memory,
      postGcHeap: this.postGcHeap,
      postGcAt: this.postGcAt,
      spaces: {
        old: spaceBytes("old_space"),
        lo: spaceBytes("large_object_space"),
        code: spaceBytes("code_space"),
        new: spaceBytes("new_space"),
      },
      contexts: {
        native: heap.number_of_native_contexts,
        detached: heap.number_of_detached_contexts,
      },
      loop,
      freemem: freemem(),
    };
  }
}
