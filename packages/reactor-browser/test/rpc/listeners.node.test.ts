import { describe, expect, it, vi } from "vitest";
import { KeyedListeners, Listeners } from "../../src/rpc/listeners.js";

describe("Listeners", () => {
  it("notifies all listeners and unsubscribes via the returned fn", () => {
    const l = new Listeners<[number]>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = l.add(a);
    l.add(b);

    l.emit(1);
    expect(a).toHaveBeenCalledWith(1);
    expect(b).toHaveBeenCalledWith(1);

    offA();
    l.emit(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("iterates a snapshot, so unsubscribing during emit is safe", () => {
    const l = new Listeners();
    const calls: string[] = [];
    let off2 = () => {};
    l.add(() => {
      calls.push("1");
      off2();
    });
    off2 = l.add(() => calls.push("2"));
    l.emit();
    expect(calls).toEqual(["1", "2"]);
  });
});

describe("KeyedListeners", () => {
  it("emits only to the keyed bucket", () => {
    const k = new KeyedListeners<string, [string]>();
    const a = vi.fn();
    const b = vi.fn();
    k.add("x", a);
    k.add("y", b);

    k.emit("x", "hi");
    expect(a).toHaveBeenCalledWith("hi");
    expect(b).not.toHaveBeenCalled();
  });

  it("emitAll hits every bucket", () => {
    const k = new KeyedListeners<string>();
    const a = vi.fn();
    const b = vi.fn();
    k.add("x", a);
    k.add("y", b);
    k.emitAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("drops the bucket after its last listener leaves, and emit becomes a no-op", () => {
    const k = new KeyedListeners<string>();
    const a = vi.fn();
    const off = k.add("x", a);
    off();
    k.emit("x");
    expect(a).not.toHaveBeenCalled();
    // re-adding works after GC
    const b = vi.fn();
    k.add("x", b);
    k.emit("x");
    expect(b).toHaveBeenCalledTimes(1);
  });
});
