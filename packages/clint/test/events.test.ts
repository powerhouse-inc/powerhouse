import { describe, it, expect } from "vitest";
import { createEventBus } from "../src/core/events.js";

describe("createEventBus", () => {
  it("emits and receives events", () => {
    const bus = createEventBus();
    const received: unknown[] = [];
    bus.on("test", (data) => received.push(data));
    bus.emit("test", { value: 42 });
    expect(received).toEqual([{ value: 42 }]);
  });

  it("supports multiple listeners", () => {
    const bus = createEventBus();
    const a: unknown[] = [];
    const b: unknown[] = [];
    bus.on("test", (data) => a.push(data));
    bus.on("test", (data) => b.push(data));
    bus.emit("test", "hello");
    expect(a).toEqual(["hello"]);
    expect(b).toEqual(["hello"]);
  });

  it("removes listeners with off()", () => {
    const bus = createEventBus();
    const received: unknown[] = [];
    const handler = (data: unknown) => received.push(data);
    bus.on("test", handler);
    bus.emit("test", 1);
    bus.off("test", handler);
    bus.emit("test", 2);
    expect(received).toEqual([1]);
  });

  it("handles events with no data", () => {
    const bus = createEventBus();
    let called = false;
    bus.on("ping", () => {
      called = true;
    });
    bus.emit("ping");
    expect(called).toBe(true);
  });

  it("isolates different event types", () => {
    const bus = createEventBus();
    const received: unknown[] = [];
    bus.on("a", (data) => received.push(data));
    bus.emit("b", "wrong");
    bus.emit("a", "right");
    expect(received).toEqual(["right"]);
  });
});
