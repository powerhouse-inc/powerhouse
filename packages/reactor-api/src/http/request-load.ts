import {
  CATCH_UP_LOAD_WINDOW_MS,
  type CatchUpLoadSample,
  type ICatchUpLoadSource,
} from "@powerhousedao/reactor";
import type http from "node:http";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";

const INSPECTION_PATH = /\/graphql\/inspection(-admin)?(\/|$)/;
const PROBE_PATH = /\/(health|ready)\/?$/;
const STREAM_PATH = /\/stream\/?$/;
const ASSET_PATH =
  /(^|\/)(assets|@vite|@fs|@id|node_modules)\/|\.[a-z0-9]{1,8}$/i;

/**
 * Whether a request counts as user load: not the monitor's inspection calls,
 * not a health probe, not a static asset and not a long-lived stream.
 */
export function isCountedRequest(url: string, accept: string = ""): boolean {
  const path = url.split("?")[0] ?? "";
  if (INSPECTION_PATH.test(path)) return false;
  if (PROBE_PATH.test(path)) return false;
  if (ASSET_PATH.test(path)) return false;
  if (STREAM_PATH.test(path)) return false;
  if (accept.includes("text/event-stream")) return false;
  return true;
}

/** Main-thread event-loop delay, as the recorder reads it once per sample. */
export interface IEventLoopDelaySource {
  /** p99 delay since the last call, in ms. */
  takeP99Ms(): number;
  stop(): void;
}

/** `perf_hooks.monitorEventLoopDelay`, reset on every read. */
export class NodeEventLoopDelay implements IEventLoopDelaySource {
  private readonly histogram: IntervalHistogram;

  constructor(resolutionMs: number = 20) {
    this.histogram = monitorEventLoopDelay({ resolution: resolutionMs });
    this.histogram.enable();
  }

  takeP99Ms(): number {
    const p99 = this.histogram.percentile(99) / 1e6;
    this.histogram.reset();
    return Number.isFinite(p99) ? p99 : 0;
  }

  stop(): void {
    this.histogram.disable();
  }
}

export type RequestLoadRecorderOptions = {
  windowMs?: number;
  now?: () => number;
  eventLoopDelay?: IEventLoopDelaySource;
};

type Completion = { at: number; ms: number };
type LoopReading = { at: number; p99Ms: number };

/**
 * Counts completed user requests and their latency over a sliding window, and
 * reads the main thread's event-loop delay, as the catch-up controller's load
 * source. Loop delay over the window is the highest per-sample p99 in it.
 */
export class RequestLoadRecorder implements ICatchUpLoadSource {
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly eventLoopDelay: IEventLoopDelaySource | undefined;
  private readonly completions: Completion[] = [];
  private readonly loopReadings: LoopReading[] = [];
  private lastCompletedAt: number;
  private readonly detachers: (() => void)[] = [];

  constructor(options: RequestLoadRecorderOptions = {}) {
    this.windowMs = options.windowMs ?? CATCH_UP_LOAD_WINDOW_MS;
    this.now = options.now ?? (() => performance.now());
    this.eventLoopDelay = options.eventLoopDelay;
    this.lastCompletedAt = this.now();
  }

  /** Records every counted request `server` completes, until `stop`. */
  attach(server: http.Server): void {
    const onRequest = (
      request: http.IncomingMessage,
      response: http.ServerResponse,
    ) => {
      const accept = request.headers.accept ?? "";
      if (!isCountedRequest(request.url ?? "", accept)) return;
      const started = this.now();
      // "close" fires once whether the response finished or the client went
      // away, so an aborted request still counts with its time so far.
      response.once("close", () => this.record(this.now() - started));
    };
    server.on("request", onRequest);
    this.detachers.push(() => server.off("request", onRequest));
  }

  // Pruned here too, so the window bounds memory even when nothing samples.
  record(durationMs: number): void {
    const at = this.now();
    this.completions.push({ at, ms: durationMs });
    this.lastCompletedAt = at;
    dropBefore(this.completions, at - this.windowMs);
  }

  sample(): CatchUpLoadSample {
    const now = this.now();
    const since = now - this.windowMs;
    dropBefore(this.completions, since);
    if (this.eventLoopDelay) {
      this.loopReadings.push({
        at: now,
        p99Ms: this.eventLoopDelay.takeP99Ms(),
      });
    }
    dropBefore(this.loopReadings, since);
    return {
      requests: this.completions.length,
      p95LatencyMs: percentile(
        this.completions.map((c) => c.ms),
        95,
      ),
      eventLoopDelayMs: Math.max(0, ...this.loopReadings.map((r) => r.p99Ms)),
      idleForMs: Math.max(0, now - this.lastCompletedAt),
    };
  }

  stop(): void {
    for (const detach of this.detachers.splice(0)) detach();
    this.eventLoopDelay?.stop();
  }
}

/** Drops entries at or before `since`; entries are in time order. */
function dropBefore(entries: { at: number }[], since: number): void {
  let stale = 0;
  while (stale < entries.length && entries[stale]!.at <= since) stale++;
  if (stale > 0) entries.splice(0, stale);
}

/** Nearest-rank percentile; 0 for no values. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}
