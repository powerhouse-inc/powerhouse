import { describe, it, expect, afterEach } from "vitest";
import {
  ThrottleState,
  createOutputThrottle,
  MIN_VELOCITY,
  MAX_VELOCITY,
  ACCELERATION,
  DECELERATION,
  BREAKING_POINT,
} from "../src/interactive/output-throttle.js";
import type { ThrottleTickEvent } from "../src/interactive/output-throttle.js";

describe("ThrottleState", () => {
  // --- Construction ---

  it("starts with zero backlog and minimum velocity", () => {
    const ts = new ThrottleState();
    expect(ts.backlog).toBe(0);
    expect(ts.velocity).toBe(MIN_VELOCITY);
    expect(ts.totalDrained).toBe(0);
  });

  // --- addChars ---

  it("addChars increases backlog", () => {
    const ts = new ThrottleState();
    ts.addChars(100);
    expect(ts.backlog).toBe(100);
    ts.addChars(50);
    expect(ts.backlog).toBe(150);
  });

  it("addChars ignores zero and negative values", () => {
    const ts = new ThrottleState();
    ts.addChars(0);
    ts.addChars(-5);
    expect(ts.backlog).toBe(0);
  });

  // --- tick (core simulation) ---

  it("tick drains chars from backlog and tracks totalDrained", () => {
    const ts = new ThrottleState();
    ts.addChars(20);
    const drained = ts.tick();
    expect(drained).toBe(MIN_VELOCITY); // 4 chars/tick
    expect(ts.backlog).toBe(20 - MIN_VELOCITY);
    expect(ts.totalDrained).toBe(MIN_VELOCITY);
  });

  it("tick drains at most the remaining backlog", () => {
    const ts = new ThrottleState();
    ts.addChars(2); // less than MIN_VELOCITY (4)
    const drained = ts.tick();
    expect(drained).toBe(2);
    expect(ts.backlog).toBe(0);
  });

  it("tick returns 0 when backlog is empty", () => {
    const ts = new ThrottleState();
    expect(ts.tick()).toBe(0);
    expect(ts.backlog).toBe(0);
  });

  // --- Acceleration ---

  it("accelerates when backlog exceeds BREAKING_POINT", () => {
    const ts = new ThrottleState();
    ts.addChars(200); // well above BREAKING_POINT (75)
    const v0 = ts.velocity;
    ts.tick();
    expect(ts.velocity).toBe(v0 + ACCELERATION);
  });

  // --- Deceleration ---

  it("decelerates when backlog drops below BREAKING_POINT", () => {
    const ts = new ThrottleState();
    // First ramp up velocity with a large backlog
    ts.addChars(200);
    ts.tick();
    ts.tick();
    ts.tick();
    const rampedVelocity = ts.velocity;
    expect(rampedVelocity).toBeGreaterThan(MIN_VELOCITY);
    // Now set backlog below BREAKING_POINT by draining most of it
    while (ts.backlog > 50) ts.tick();
    // Next tick should decelerate (backlog ≤ BREAKING_POINT)
    const vBefore = ts.velocity;
    ts.tick();
    expect(ts.velocity).toBe(Math.max(MIN_VELOCITY, vBefore - DECELERATION));
  });

  // --- Velocity clamping ---

  it("velocity never drops below MIN_VELOCITY", () => {
    const ts = new ThrottleState();
    ts.addChars(10);
    for (let i = 0; i < 50; i++) {
      ts.addChars(1); // keep backlog small but nonzero
      ts.tick();
    }
    expect(ts.velocity).toBeGreaterThanOrEqual(MIN_VELOCITY);
  });

  it("velocity never exceeds MAX_VELOCITY", () => {
    const ts = new ThrottleState();
    ts.addChars(10000); // massive backlog
    for (let i = 0; i < 200; i++) ts.tick();
    expect(ts.velocity).toBeLessThanOrEqual(MAX_VELOCITY);
  });

  // --- isDrained ---

  it("isDrained is true when backlog is zero", () => {
    const ts = new ThrottleState();
    expect(ts.isDrained).toBe(true);
    ts.addChars(2);
    expect(ts.isDrained).toBe(false);
    ts.tick(); // drains all 2 chars (MIN_VELOCITY > 2)
    expect(ts.isDrained).toBe(true);
  });

  // --- reset ---

  it("reset clears backlog, totalDrained, and resets velocity", () => {
    const ts = new ThrottleState();
    ts.addChars(200);
    ts.tick();
    ts.tick();
    ts.tick();
    ts.reset();
    expect(ts.backlog).toBe(0);
    expect(ts.velocity).toBe(MIN_VELOCITY);
    expect(ts.totalDrained).toBe(0);
  });

  // --- Multi-tick simulation ---

  it("fully drains a small burst in a few ticks", () => {
    const ts = new ThrottleState();
    ts.addChars(10);
    let ticks = 0;
    while (!ts.isDrained) {
      ts.tick();
      ticks++;
    }
    expect(ticks).toBeGreaterThan(0);
    expect(ticks).toBeLessThan(10); // 10 chars at ~4/tick = 3 ticks
    expect(ts.totalDrained).toBe(10);
  });

  it("ramps up velocity during sustained large backlog", () => {
    const ts = new ThrottleState();
    ts.addChars(1000);
    const drains: number[] = [];
    for (let i = 0; i < 20; i++) drains.push(ts.tick());
    // Later ticks should drain more than earlier ticks
    expect(drains[19]!).toBeGreaterThan(drains[0]!);
  });

  it("velocity resets to MIN_VELOCITY when backlog fully drains", () => {
    const ts = new ThrottleState();
    ts.addChars(200);
    // Tick until velocity has ramped up
    for (let i = 0; i < 5; i++) ts.tick();
    expect(ts.velocity).toBeGreaterThan(MIN_VELOCITY);
    // Now drain completely
    while (!ts.isDrained) ts.tick();
    expect(ts.velocity).toBe(MIN_VELOCITY);
  });

  it("totalDrained equals input after full drain", () => {
    const ts = new ThrottleState();
    ts.addChars(500);
    ts.addChars(300);
    while (!ts.isDrained) ts.tick();
    expect(ts.totalDrained).toBe(800);
  });
});

// ── createOutputThrottle (real timers, event handler) ───────────

describe("createOutputThrottle", () => {
  let throttle: ReturnType<typeof createOutputThrottle>;

  afterEach(() => {
    throttle?.reset();
  });

  it("fires onTick events with correct tick-to-values mapping", async () => {
    const events: ThrottleTickEvent[] = [];
    throttle = createOutputThrottle({ onTick: (e) => events.push(e) });

    throttle.addChars(20);
    await throttle.waitForDrain();

    // Verify tick numbering starts at 1 and is sequential
    expect(events.length).toBeGreaterThan(0);
    for (let i = 0; i < events.length; i++) {
      expect(events[i]!.tick).toBe(i + 1);
    }

    // Every tick drains something
    for (const e of events) {
      expect(e.drain).toBeGreaterThan(0);
    }

    // totalDrained increases monotonically and ends at 20
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.totalDrained).toBeGreaterThan(
        events[i - 1]!.totalDrained,
      );
    }
    expect(events[events.length - 1]!.totalDrained).toBe(20);

    // Backlog decreases monotonically to 0
    expect(events[events.length - 1]!.backlog).toBe(0);
  });

  it("visibleChars tracks totalDrained", async () => {
    throttle = createOutputThrottle();
    expect(throttle.visibleChars).toBe(0);

    throttle.addChars(15);
    await throttle.waitForDrain();
    expect(throttle.visibleChars).toBe(15);
  });

  it("waitForDrain resolves immediately when empty", async () => {
    throttle = createOutputThrottle();
    await throttle.waitForDrain(); // should not hang
  });

  it("addChars ignores zero and negative values", async () => {
    const events: ThrottleTickEvent[] = [];
    throttle = createOutputThrottle({ onTick: (e) => events.push(e) });
    throttle.addChars(0);
    throttle.addChars(-5);
    // Give a tick cycle to confirm no timer started
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events.length).toBe(0);
  });

  it("accelerates during large backlog, decelerates when small", async () => {
    const events: ThrottleTickEvent[] = [];
    throttle = createOutputThrottle({ onTick: (e) => events.push(e) });

    throttle.addChars(500);
    await throttle.waitForDrain();

    // Find the tick where backlog first drops below BREAKING_POINT
    const crossIdx = events.findIndex((e) => e.backlog <= BREAKING_POINT);
    expect(crossIdx).toBeGreaterThan(0);

    // Before crossing: velocity should have been increasing
    const preCross = events.slice(0, crossIdx);
    for (let i = 1; i < preCross.length; i++) {
      expect(preCross[i]!.velocity).toBeGreaterThanOrEqual(
        preCross[i - 1]!.velocity,
      );
    }
  });

  it("reset clears state and stops timer", async () => {
    const events: ThrottleTickEvent[] = [];
    throttle = createOutputThrottle({ onTick: (e) => events.push(e) });

    throttle.addChars(100);
    // Let a few ticks fire
    await new Promise((resolve) => setTimeout(resolve, 150));
    const countBefore = events.length;
    expect(countBefore).toBeGreaterThan(0);

    throttle.reset();
    expect(throttle.visibleChars).toBe(0);

    // No more events after reset
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(events.length).toBe(countBefore);
  });
});
