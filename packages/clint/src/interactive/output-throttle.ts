import { useState, useRef, useCallback } from "react";

// --- Constants (per-second, converted to per-tick at runtime) ---

export const FRAME_RATE = 20;
export const TICK_MS = 1000 / FRAME_RATE;
/** Floor velocity (chars/s). */
export const MIN_VELOCITY_S = 80;
/** Max chars released per second. */
export const MAX_VELOCITY_S = 600;
/** Velocity gain per second while backlog > BREAKING_POINT. */
export const ACCELERATION_S = 120;
/** Velocity loss per second while backlog <= BREAKING_POINT. */
export const DECELERATION_S = 10;
/** Backlog threshold that switches between acceleration and deceleration. */
export const BREAKING_POINT = 75;

// Per-tick derived values
export const MIN_VELOCITY = MIN_VELOCITY_S / FRAME_RATE;
export const MAX_VELOCITY = MAX_VELOCITY_S / FRAME_RATE;
export const ACCELERATION = ACCELERATION_S / FRAME_RATE;
export const DECELERATION = DECELERATION_S / FRAME_RATE;

// ── Pure throttle simulation (no React, no timers) ─────────────

/**
 * Pure state machine for the output throttle simulation.
 *
 * Characters accumulate in a backlog and are released at a velocity
 * that ramps up with acceleration and decelerates when the backlog
 * drains below BREAKING_POINT. Each call to tick() advances one frame.
 */
export class ThrottleState {
  backlog = 0;
  velocity = MIN_VELOCITY;
  totalDrained = 0;

  /** Add characters to the backlog. Ignores zero/negative values. */
  addChars(n: number): void {
    if (n > 0) this.backlog += n;
  }

  /** Immediately release characters, bypassing the backlog. */
  addImmediate(n: number): void {
    if (n > 0) this.totalDrained += n;
  }

  /**
   * Advance one tick: adjust velocity, drain characters from backlog.
   * Returns the number of characters drained this tick.
   */
  tick(): number {
    if (this.backlog <= 0) return 0;

    // Accelerate or decelerate
    if (this.backlog > BREAKING_POINT) {
      this.velocity += ACCELERATION;
    } else {
      this.velocity -= DECELERATION;
    }
    this.velocity = Math.max(
      MIN_VELOCITY,
      Math.min(MAX_VELOCITY, this.velocity),
    );

    // Drain
    const drain = Math.min(this.velocity, this.backlog);
    this.backlog -= drain;
    this.totalDrained += drain;

    // Snap to zero when fully drained
    if (this.backlog <= 0) {
      this.backlog = 0;
      this.velocity = MIN_VELOCITY;
    }

    return drain;
  }

  /** True when the backlog is fully drained. */
  get isDrained(): boolean {
    return this.backlog <= 0;
  }

  /** Reset all state to initial values. */
  reset(): void {
    this.backlog = 0;
    this.velocity = MIN_VELOCITY;
    this.totalDrained = 0;
  }
}

// ── Tick event for observability ─────────────────────────────────

export interface ThrottleTickEvent {
  tick: number;
  backlog: number;
  velocity: number;
  drain: number;
  totalDrained: number;
}

export type ThrottleEventHandler = (event: ThrottleTickEvent) => void;

// ── Standalone throttle (real timers, no React) ─────────────────

export interface OutputThrottle {
  /** Total number of characters approved for display. */
  visibleChars: number;
  /** Call when new characters arrive (increases backlog). */
  addChars: (n: number) => void;
  /** Immediately approve characters for display, bypassing the backlog. */
  addImmediate: (n: number) => void;
  /** Returns a promise that resolves when the backlog is fully drained. */
  waitForDrain: () => Promise<void>;
  /** Reset all state (call when a new execution starts). */
  reset: () => void;
}

export interface CreateOutputThrottleOptions {
  onTick?: ThrottleEventHandler;
}

/**
 * Create a standalone output throttle with real setInterval timers.
 *
 * This is the testable core: no React, no hooks. The React hook
 * (useOutputThrottle) is a thin wrapper that adds useState on top.
 */
export function createOutputThrottle(
  options?: CreateOutputThrottleOptions,
): OutputThrottle {
  const ts = new ThrottleState();
  let tickCount = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let drainResolve: (() => void) | null = null;
  let _visibleChars = 0;

  function startTimer(): void {
    if (timer) return;
    tickCount = 0;
    timer = setInterval(() => {
      tickCount++;
      const drain = ts.tick();
      _visibleChars += drain;

      options?.onTick?.({
        tick: tickCount,
        backlog: ts.backlog,
        velocity: ts.velocity,
        drain,
        totalDrained: ts.totalDrained,
      });

      if (ts.isDrained) {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        if (drainResolve) {
          drainResolve();
          drainResolve = null;
        }
      }
    }, TICK_MS);
  }

  return {
    get visibleChars() {
      return _visibleChars;
    },
    addChars(n: number) {
      if (n <= 0) return;
      ts.addChars(n);
      startTimer();
    },
    addImmediate(n: number) {
      if (n <= 0) return;
      ts.addImmediate(n);
      _visibleChars += n;
    },
    waitForDrain(): Promise<void> {
      if (ts.isDrained && !timer) return Promise.resolve();
      return new Promise((resolve) => {
        drainResolve = resolve;
      });
    },
    reset() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      ts.reset();
      _visibleChars = 0;
    },
  };
}

// ── React hook (thin wrapper over createOutputThrottle) ─────────

/**
 * React hook that smooths streaming output delivery.
 *
 * Delegates all simulation and timer logic to createOutputThrottle;
 * this hook only adds React state updates for visibleChars.
 */
export function useOutputThrottle(
  options?: CreateOutputThrottleOptions,
): OutputThrottle {
  const [visibleChars, setVisibleChars] = useState(0);

  const throttle = useRef(
    createOutputThrottle({
      onTick(event) {
        setVisibleChars(event.totalDrained);
        options?.onTick?.(event);
      },
    }),
  );

  return {
    visibleChars,
    addChars: useCallback((n: number) => throttle.current.addChars(n), []),
    addImmediate: useCallback((n: number) => {
      throttle.current.addImmediate(n);
      setVisibleChars((prev) => prev + n);
    }, []),
    waitForDrain: useCallback(() => throttle.current.waitForDrain(), []),
    reset: useCallback(() => {
      throttle.current.reset();
      setVisibleChars(0);
    }, []),
  };
}
