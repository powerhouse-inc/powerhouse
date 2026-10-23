import { BackfillSlots, pauseFor, yieldToEventLoop } from "./backfill-slots.js";

/** How a backfill gives way between pages; "stop" waits until the level rises. */
export type CatchUpGiveWay = "stop" | "pause" | "yield" | "none";

/** What one catch-up priority level sets. */
export type CatchUpLevelSettings = {
  /** Backfills scanning at once, across all processors. */
  readonly slots: number;
  /** Ordinals per backfill read; 0 at level 0, where nothing is read. */
  readonly pageSize: number;
  /** Wait between pages when `giveWay` is "pause". */
  readonly pauseMs: number;
  readonly giveWay: CatchUpGiveWay;
};

/** Fixed: a level set by hand. Dynamic: the controller picks one from load. */
export type CatchUpPriorityMode = "fixed" | "dynamic";

export type CatchUpPrioritySetting =
  | { readonly mode: "dynamic" }
  | { readonly mode: "fixed"; readonly level: number };

/** Load over the host's last window; see `CATCH_UP_LOAD_WINDOW_MS`. */
export type CatchUpLoadSample = {
  /** User requests completed in the window. */
  readonly requests: number;
  /** p95 latency of those requests; 0 without any. */
  readonly p95LatencyMs: number;
  /** p99 event-loop delay of the main thread. */
  readonly eventLoopDelayMs: number;
  /** Time since the last user request completed. */
  readonly idleForMs: number;
};

/** The host's load signals, sampled once per controller tick. */
export interface ICatchUpLoadSource {
  sample(): CatchUpLoadSample;
}

export type CatchUpPriorityState = {
  readonly mode: CatchUpPriorityMode;
  readonly level: number;
  readonly settings: CatchUpLevelSettings;
  readonly reason: string;
  /** Undefined until a dynamic tick has sampled the host's load. */
  readonly sample: CatchUpLoadSample | undefined;
};

/** Index = level. Level 4 is the behaviour before priorities existed. */
export const CATCH_UP_LEVELS: readonly CatchUpLevelSettings[] = Object.freeze([
  { slots: 0, pageSize: 0, pauseMs: 0, giveWay: "stop" },
  { slots: 1, pageSize: 100, pauseMs: 50, giveWay: "pause" },
  { slots: 1, pageSize: 250, pauseMs: 20, giveWay: "pause" },
  { slots: 2, pageSize: 250, pauseMs: 10, giveWay: "pause" },
  { slots: 3, pageSize: 500, pauseMs: 0, giveWay: "yield" },
  { slots: 4, pageSize: 500, pauseMs: 0, giveWay: "yield" },
  { slots: 6, pageSize: 1000, pauseMs: 0, giveWay: "yield" },
  { slots: 8, pageSize: 2000, pauseMs: 0, giveWay: "none" },
]);

export const MIN_CATCH_UP_LEVEL = 0;
export const MAX_CATCH_UP_LEVEL = 7;
/** The dynamic controller's range: catch-up always progresses, requests always get a turn. */
export const MIN_DYNAMIC_LEVEL = 1;
export const MAX_DYNAMIC_LEVEL = 6;
export const DYNAMIC_START_LEVEL = 4;
/** The highest level the controller climbs to while requests are active. */
export const MAX_BUSY_LEVEL = 5;

export const CATCH_UP_TICK_MS = 1_000;
/** The sliding window a load source samples over. */
export const CATCH_UP_LOAD_WINDOW_MS = 5_000;

/** Above either, the controller drops. */
export const PRESSURE_P95_MS = 250;
export const PRESSURE_LOOP_DELAY_MS = 100;
/** Below both, with requests in the window, a tick is calm. */
export const HEALTHY_P95_MS = 125;
export const HEALTHY_LOOP_DELAY_MS = 50;
export const PRESSURE_DROP = 2;
/**
 * Ticks after a pressure drop in which pressure only holds: one spike stays in
 * the window this long, so it drops the level once, not once per tick.
 */
export const PRESSURE_COOLDOWN_TICKS = Math.ceil(
  CATCH_UP_LOAD_WINDOW_MS / CATCH_UP_TICK_MS,
);
export const CALM_TICKS_TO_RISE = 5;
export const IDLE_AFTER_MS = 10_000;
export const IDLE_TICKS_TO_RISE = 2;

export function isCatchUpLevel(level: unknown): level is number {
  return (
    typeof level === "number" &&
    Number.isInteger(level) &&
    level >= MIN_CATCH_UP_LEVEL &&
    level <= MAX_CATCH_UP_LEVEL
  );
}

/** Throws unless `setting` is dynamic or fixed at an integer level 0-7. */
export function assertCatchUpPrioritySetting(
  setting: CatchUpPrioritySetting,
): void {
  const mode = (setting as { mode?: unknown }).mode;
  if (mode === "dynamic") return;
  if (mode !== "fixed") {
    throw new Error(
      `Catch-up priority mode must be "fixed" or "dynamic", not ${JSON.stringify(mode)}`,
    );
  }
  const level = (setting as { level?: unknown }).level;
  if (!isCatchUpLevel(level)) {
    throw new Error(
      `Catch-up priority level must be an integer from ${MIN_CATCH_UP_LEVEL} to ${MAX_CATCH_UP_LEVEL}, not ${JSON.stringify(level)}`,
    );
  }
}

/**
 * Parses `dynamic` or a level `0`-`7`, as `PH_CATCH_UP_PRIORITY` holds it.
 * Undefined for anything else; an empty or missing value is dynamic.
 */
export function parseCatchUpPriority(
  value: string | undefined,
): CatchUpPrioritySetting | undefined {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (trimmed === "" || trimmed === "dynamic") return { mode: "dynamic" };
  if (!/^[0-9]$/.test(trimmed)) return undefined;
  const level = Number(trimmed);
  return isCatchUpLevel(level) ? { mode: "fixed", level } : undefined;
}

export type DynamicPriorityDecision = {
  readonly level: number;
  readonly reason: string;
};

/**
 * Additive increase, multiplicative decrease against a latency target, with an
 * idle boost and hysteresis. Pure: each `tick` takes one load sample over the
 * window and returns the level and why. First matching rule wins: pressure
 * drops 2, then holds for a window's worth of ticks; busy and healthy rises 1
 * after 5 calm ticks, to at most 5; idle for 10 s rises 1 every 2 ticks, to at
 * most 6; otherwise it holds.
 */
export class DynamicPriorityController {
  private current: number;
  private calmTicks = 0;
  private idleTicks = 0;
  private cooldownTicks = 0;

  constructor(start: number = DYNAMIC_START_LEVEL) {
    this.current = clampDynamic(start);
  }

  get level(): number {
    return this.current;
  }

  tick(sample: CatchUpLoadSample): DynamicPriorityDecision {
    if (this.cooldownTicks > 0) this.cooldownTicks--;
    if (
      sample.p95LatencyMs > PRESSURE_P95_MS ||
      sample.eventLoopDelayMs > PRESSURE_LOOP_DELAY_MS
    ) {
      this.calmTicks = 0;
      this.idleTicks = 0;
      const reason =
        sample.p95LatencyMs > PRESSURE_P95_MS
          ? `pressure: p95 ${Math.round(sample.p95LatencyMs)} ms`
          : `pressure: loop delay ${Math.round(sample.eventLoopDelayMs)} ms`;
      // The window still holds the spike that caused the last drop.
      if (this.cooldownTicks > 0) return this.decide(`${reason}, cooling down`);
      this.cooldownTicks = PRESSURE_COOLDOWN_TICKS;
      this.current = Math.max(MIN_DYNAMIC_LEVEL, this.current - PRESSURE_DROP);
      return this.decide(reason);
    }

    if (
      sample.requests > 0 &&
      sample.p95LatencyMs < HEALTHY_P95_MS &&
      sample.eventLoopDelayMs < HEALTHY_LOOP_DELAY_MS
    ) {
      this.idleTicks = 0;
      // An idle boost to 6 ends once requests are back.
      if (this.current > MAX_BUSY_LEVEL) this.current = MAX_BUSY_LEVEL;
      this.calmTicks++;
      if (this.calmTicks >= CALM_TICKS_TO_RISE) {
        this.calmTicks = 0;
        if (this.current < MAX_BUSY_LEVEL) this.current++;
      }
      return this.decide("busy, healthy");
    }

    if (sample.requests === 0 && sample.idleForMs >= IDLE_AFTER_MS) {
      this.calmTicks = 0;
      this.idleTicks++;
      if (this.idleTicks >= IDLE_TICKS_TO_RISE) {
        this.idleTicks = 0;
        if (this.current < MAX_DYNAMIC_LEVEL) this.current++;
      }
      return this.decide(`idle ${Math.floor(sample.idleForMs / 1_000)} s`);
    }

    this.calmTicks = 0;
    this.idleTicks = 0;
    return this.decide("holding");
  }

  private decide(reason: string): DynamicPriorityDecision {
    return { level: this.current, reason };
  }
}

function clampDynamic(level: number): number {
  return Math.min(MAX_DYNAMIC_LEVEL, Math.max(MIN_DYNAMIC_LEVEL, level));
}

export type CatchUpPriorityListener = (state: CatchUpPriorityState) => void;

const DYNAMIC_STARTING_REASON = "starting";
const DYNAMIC_NO_LOAD_REASON = "no load signal";
const FIXED_REASON = "fixed";

/**
 * One reactor's catch-up priority, shared by every processor queue: the
 * backfill slots, and the page size and pause each page reads. Live
 * deliveries never pass through it.
 */
export class CatchUpPriority {
  /** Resized with the level; running holders keep theirs when it drops. */
  readonly slots: BackfillSlots;
  private mode: CatchUpPriorityMode;
  private level: number;
  private reason: string;
  private sample: CatchUpLoadSample | undefined;
  private controller: DynamicPriorityController;
  private loadSource: ICatchUpLoadSource | undefined;
  private readonly listeners = new Set<CatchUpPriorityListener>();

  constructor(
    setting: CatchUpPrioritySetting = { mode: "dynamic" },
    loadSource?: ICatchUpLoadSource,
  ) {
    assertCatchUpPrioritySetting(setting);
    this.loadSource = loadSource;
    this.controller = new DynamicPriorityController();
    this.mode = setting.mode;
    this.level =
      setting.mode === "fixed" ? setting.level : this.controller.level;
    this.reason = this.idleReason();
    this.slots = new BackfillSlots(CATCH_UP_LEVELS[this.level]!.slots);
  }

  get(): CatchUpPriorityState {
    return {
      mode: this.mode,
      level: this.level,
      settings: { ...CATCH_UP_LEVELS[this.level]! },
      reason: this.reason,
      sample: this.sample && { ...this.sample },
    };
  }

  /** Switching to dynamic restarts the controller at its start level. */
  set(setting: CatchUpPrioritySetting): void {
    assertCatchUpPrioritySetting(setting);
    this.mode = setting.mode;
    // A sample from before the switch describes neither mode's level.
    this.sample = undefined;
    if (setting.mode === "fixed") {
      this.apply(setting.level, FIXED_REASON);
      return;
    }
    this.controller = new DynamicPriorityController();
    this.apply(this.controller.level, this.idleReason());
  }

  setLoadSource(source: ICatchUpLoadSource | undefined): void {
    this.loadSource = source;
    if (this.mode === "dynamic" && this.sample === undefined) {
      this.apply(this.level, this.idleReason());
    }
  }

  /** One controller step; a no-op when fixed or without a load source. */
  tick(): void {
    if (this.mode !== "dynamic" || !this.loadSource) return;
    let sample: CatchUpLoadSample;
    try {
      sample = this.loadSource.sample();
    } catch {
      return;
    }
    this.sample = sample;
    const decision = this.controller.tick(sample);
    this.apply(decision.level, decision.reason);
  }

  /** Ticks every `intervalMs` on an unref'd timer; returns its stop. */
  startTicking(intervalMs: number = CATCH_UP_TICK_MS): () => void {
    const timer = setInterval(() => this.tick(), intervalMs);
    (timer as { unref?: () => void }).unref?.();
    return () => clearInterval(timer);
  }

  subscribe(listener: CatchUpPriorityListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The page size the next backfill read takes; never 0. */
  pageSize(): number {
    const size = CATCH_UP_LEVELS[this.level]!.pageSize;
    return size > 0 ? size : CATCH_UP_LEVELS[MIN_DYNAMIC_LEVEL]!.pageSize;
  }

  /**
   * Gives way as the current level says before the next page. At level 0 it
   * waits until the level rises. `cancel` aborting ends any wait early.
   */
  async betweenPages(cancel?: AbortSignal): Promise<void> {
    await this.whileStopped(cancel);
    const settings = CATCH_UP_LEVELS[this.level]!;
    switch (settings.giveWay) {
      case "pause":
        await pauseFor(settings.pauseMs, cancel);
        return;
      case "yield":
        await yieldToEventLoop();
        return;
      case "stop":
      case "none":
        return;
    }
  }

  private whileStopped(cancel?: AbortSignal): Promise<void> {
    if (this.level > 0 || cancel?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const end = () => {
        unsubscribe();
        cancel?.removeEventListener("abort", end);
        resolve();
      };
      const unsubscribe = this.subscribe((state) => {
        if (state.level !== 0) end();
      });
      cancel?.addEventListener("abort", end, { once: true });
    });
  }

  private idleReason(): string {
    if (this.mode === "fixed") return FIXED_REASON;
    return this.loadSource ? DYNAMIC_STARTING_REASON : DYNAMIC_NO_LOAD_REASON;
  }

  private apply(level: number, reason: string): void {
    this.level = level;
    this.reason = reason;
    this.slots.resize(CATCH_UP_LEVELS[level]!.slots);
    const state = this.get();
    for (const listener of [...this.listeners]) {
      try {
        listener(state);
      } catch {
        continue;
      }
    }
  }
}
