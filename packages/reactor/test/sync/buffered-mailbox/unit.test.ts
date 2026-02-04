import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailboxAggregateError } from "../../../src/sync/mailbox.js";
import { BufferedMailbox } from "../../../src/sync/buffered-mailbox.js";

type TestItem = {
  id: string;
  value: number;
};

describe("BufferedMailbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should initialize with empty items", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);

      expect(mailbox.items).toEqual([]);
    });
  });

  describe("immediate item storage", () => {
    it("should store item immediately on add", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.add(item);

      expect(mailbox.items).toHaveLength(1);
      expect(mailbox.items[0]).toBe(item);
    });

    it("should remove item immediately on remove", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.add(item);
      mailbox.remove(item);

      expect(mailbox.items).toHaveLength(0);
    });

    it("should return item by id via get", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.add(item);

      expect(mailbox.get("item1")).toBe(item);
    });

    it("should return undefined for non-existent id", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);

      expect(mailbox.get("nonexistent")).toBeUndefined();
    });
  });

  describe("deferred callbacks", () => {
    it("should not call onAdded callback immediately", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onAdded(callback);
      mailbox.add(item);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not call onRemoved callback immediately", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onRemoved(callback);
      mailbox.add(item);
      mailbox.remove(item);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("timer-based flush", () => {
    it("should call onAdded callback after timer fires", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onAdded(callback);
      mailbox.add(item);

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([item]);
    });

    it("should call onRemoved callback after timer fires", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onRemoved(callback);
      mailbox.add(item);
      mailbox.remove(item);

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([item]);
    });

    it("should call callback with all buffered items on flush", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback = vi.fn();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };
      const item3: TestItem = { id: "item3", value: 3 };

      mailbox.onAdded(callback);
      mailbox.add(item1);
      mailbox.add(item2);
      mailbox.add(item3);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([item1, item2, item3]);
    });
  });

  describe("max queue flush", () => {
    it("should flush immediately when maxQueued reached on add", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 3);
      const callback = vi.fn();

      mailbox.onAdded(callback);

      const item1 = { id: "item1", value: 1 };
      const item2 = { id: "item2", value: 2 };
      const item3 = { id: "item3", value: 3 };

      mailbox.add(item1);
      expect(callback).not.toHaveBeenCalled();

      mailbox.add(item2);
      expect(callback).not.toHaveBeenCalled();

      mailbox.add(item3);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([item1, item2, item3]);
    });

    it("should flush immediately when maxQueued reached on remove", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 3);
      const callback = vi.fn();

      mailbox.onRemoved(callback);

      const items = [
        { id: "item1", value: 1 },
        { id: "item2", value: 2 },
        { id: "item3", value: 3 },
      ];

      items.forEach((item) => mailbox.add(item));
      vi.advanceTimersByTime(100);

      mailbox.remove(items[0]);
      expect(callback).not.toHaveBeenCalled();

      mailbox.remove(items[1]);
      expect(callback).not.toHaveBeenCalled();

      mailbox.remove(items[2]);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([items[0], items[1], items[2]]);
    });

    it("should reset buffer after max queue flush", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 2);
      const callback = vi.fn();

      mailbox.onAdded(callback);

      mailbox.add({ id: "item1", value: 1 });
      mailbox.add({ id: "item2", value: 2 });

      expect(callback).toHaveBeenCalledTimes(1);
      callback.mockClear();

      mailbox.add({ id: "item3", value: 3 });
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("timer reset behavior", () => {
    it("should reset timer when new item added", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback = vi.fn();

      mailbox.onAdded(callback);

      const item1 = { id: "item1", value: 1 };
      const item2 = { id: "item2", value: 2 };

      mailbox.add(item1);

      vi.advanceTimersByTime(50);
      expect(callback).not.toHaveBeenCalled();

      mailbox.add(item2);

      vi.advanceTimersByTime(50);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([item1, item2]);
    });

    it("should reset timer when new item removed", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback = vi.fn();

      mailbox.onRemoved(callback);

      const items = [
        { id: "item1", value: 1 },
        { id: "item2", value: 2 },
      ];
      items.forEach((item) => mailbox.add(item));
      vi.advanceTimersByTime(100);

      mailbox.remove(items[0]);

      vi.advanceTimersByTime(50);
      expect(callback).not.toHaveBeenCalled();

      mailbox.remove(items[1]);

      vi.advanceTimersByTime(50);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([items[0], items[1]]);
    });
  });

  describe("separate add/remove buffers", () => {
    it("should maintain independent timing for add and remove buffers", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const addedCallback = vi.fn();
      const removedCallback = vi.fn();

      mailbox.onAdded(addedCallback);
      mailbox.onRemoved(removedCallback);

      const item: TestItem = { id: "item1", value: 42 };

      mailbox.add(item);

      vi.advanceTimersByTime(50);

      mailbox.remove(item);

      vi.advanceTimersByTime(50);

      expect(addedCallback).toHaveBeenCalledTimes(1);
      expect(removedCallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);

      expect(removedCallback).toHaveBeenCalledTimes(1);
    });

    it("should have independent maxQueued triggers for add and remove", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 2);
      const addedCallback = vi.fn();
      const removedCallback = vi.fn();

      mailbox.onAdded(addedCallback);
      mailbox.onRemoved(removedCallback);

      const item1 = { id: "item1", value: 1 };
      const item2 = { id: "item2", value: 2 };

      mailbox.add(item1);
      mailbox.add(item2);

      expect(addedCallback).toHaveBeenCalledTimes(1);
      expect(addedCallback).toHaveBeenCalledWith([item1, item2]);
      expect(removedCallback).not.toHaveBeenCalled();

      mailbox.remove(item1);
      expect(removedCallback).not.toHaveBeenCalled();

      mailbox.remove(item2);
      expect(removedCallback).toHaveBeenCalledTimes(1);
      expect(removedCallback).toHaveBeenCalledWith([item1, item2]);
    });
  });

  describe("callback invocation order", () => {
    it("should call all callbacks in registration order", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callOrder: string[] = [];

      mailbox.onAdded(() => callOrder.push("callback1"));
      mailbox.onAdded(() => callOrder.push("callback2"));
      mailbox.onAdded(() => callOrder.push("callback3"));

      mailbox.add({ id: "item1", value: 1 });
      mailbox.add({ id: "item2", value: 2 });

      vi.advanceTimersByTime(100);

      expect(callOrder).toEqual(["callback1", "callback2", "callback3"]);
    });

    it("should invoke callbacks with items in the order they were added", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      let receivedItems: TestItem[] = [];

      mailbox.onAdded((items) => {
        receivedItems = items;
      });

      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };
      const item3: TestItem = { id: "item3", value: 3 };

      mailbox.add(item1);
      mailbox.add(item2);
      mailbox.add(item3);

      vi.advanceTimersByTime(100);

      expect(receivedItems).toEqual([item1, item2, item3]);
    });
  });

  describe("error handling", () => {
    it("should collect errors from callbacks and throw aggregate error", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);

      mailbox.onAdded(() => {
        throw new Error("Callback 1 error");
      });
      mailbox.onAdded(() => {});
      mailbox.onAdded(() => {
        throw new Error("Callback 2 error");
      });

      mailbox.add({ id: "item1", value: 1 });

      expect(() => vi.advanceTimersByTime(100)).toThrow(MailboxAggregateError);
    });

    it("should call all callbacks even if some throw", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback1 = vi.fn(() => {
        throw new Error("Error 1");
      });
      const callback2 = vi.fn();
      const callback3 = vi.fn(() => {
        throw new Error("Error 2");
      });
      const callback4 = vi.fn();

      mailbox.onAdded(callback1);
      mailbox.onAdded(callback2);
      mailbox.onAdded(callback3);
      mailbox.onAdded(callback4);

      const item: TestItem = { id: "item1", value: 42 };
      mailbox.add(item);

      try {
        vi.advanceTimersByTime(100);
      } catch {
        // Expected to throw
      }

      expect(callback1).toHaveBeenCalledWith([item]);
      expect(callback2).toHaveBeenCalledWith([item]);
      expect(callback3).toHaveBeenCalledWith([item]);
      expect(callback4).toHaveBeenCalledWith([item]);
    });

    it("should include all errors in aggregate error", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);

      mailbox.onAdded(() => {
        throw new Error("Error A");
      });
      mailbox.onAdded(() => {
        throw new Error("Error B");
      });

      mailbox.add({ id: "item1", value: 1 });

      try {
        vi.advanceTimersByTime(100);
      } catch (error) {
        expect(error).toBeInstanceOf(MailboxAggregateError);
        const aggError = error as MailboxAggregateError;
        expect(aggError.errors).toHaveLength(2);
        expect(aggError.errors[0].message).toBe("Error A");
        expect(aggError.errors[1].message).toBe("Error B");
      }
    });

    it("should collect errors from each callback", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);

      mailbox.onAdded(() => {
        throw new Error("Error 1");
      });
      mailbox.onAdded(() => {
        throw new Error("Error 2");
      });

      mailbox.add({ id: "item1", value: 1 });
      mailbox.add({ id: "item2", value: 2 });

      try {
        vi.advanceTimersByTime(100);
      } catch (error) {
        expect(error).toBeInstanceOf(MailboxAggregateError);
        const aggError = error as MailboxAggregateError;
        expect(aggError.errors).toHaveLength(2);
      }
    });
  });

  describe("manual flush", () => {
    it("should flush both buffers when flush() is called", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const addedCallback = vi.fn();
      const removedCallback = vi.fn();

      mailbox.onAdded(addedCallback);
      mailbox.onRemoved(removedCallback);

      const item: TestItem = { id: "item1", value: 42 };
      mailbox.add(item);
      mailbox.remove(item);

      expect(addedCallback).not.toHaveBeenCalled();
      expect(removedCallback).not.toHaveBeenCalled();

      mailbox.flush();

      expect(addedCallback).toHaveBeenCalledTimes(1);
      expect(removedCallback).toHaveBeenCalledTimes(1);
    });

    it("should clear pending timers on manual flush", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback = vi.fn();

      mailbox.onAdded(callback);
      mailbox.add({ id: "item1", value: 1 });

      mailbox.flush();
      expect(callback).toHaveBeenCalledTimes(1);

      callback.mockClear();

      vi.advanceTimersByTime(100);
      expect(callback).not.toHaveBeenCalled();
    });

    it("should do nothing when flush called with empty buffers", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback = vi.fn();

      mailbox.onAdded(callback);

      expect(() => mailbox.flush()).not.toThrow();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle empty flush gracefully", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback = vi.fn();

      mailbox.onAdded(callback);

      vi.advanceTimersByTime(100);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle rapid operations", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 50);
      const callback = vi.fn();

      mailbox.onAdded(callback);

      for (let i = 0; i < 100; i++) {
        mailbox.add({ id: `item${i}`, value: i });
      }

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("should handle maxQueued of 1", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 1);
      const callback = vi.fn();

      mailbox.onAdded(callback);

      mailbox.add({ id: "item1", value: 1 });
      expect(callback).toHaveBeenCalledTimes(1);

      mailbox.add({ id: "item2", value: 2 });
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("should replace item with same id", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const item1: TestItem = { id: "same", value: 1 };
      const item2: TestItem = { id: "same", value: 2 };

      mailbox.add(item1);
      mailbox.add(item2);

      expect(mailbox.items).toHaveLength(1);
      expect(mailbox.get("same")).toBe(item2);
    });

    it("should handle callback registered during flush", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callOrder: string[] = [];

      mailbox.onAdded(() => {
        callOrder.push("callback1");
        mailbox.onAdded(() => {
          callOrder.push("callback2-from-callback1");
        });
      });

      mailbox.add({ id: "item1", value: 1 });
      vi.advanceTimersByTime(100);

      expect(callOrder).toEqual(["callback1"]);

      callOrder.length = 0;
      mailbox.add({ id: "item2", value: 2 });
      vi.advanceTimersByTime(100);

      expect(callOrder).toEqual(["callback1", "callback2-from-callback1"]);
    });

    it("should handle multiple add/remove cycles", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const addedCallback = vi.fn();
      const removedCallback = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onAdded(addedCallback);
      mailbox.onRemoved(removedCallback);

      mailbox.add(item);
      vi.advanceTimersByTime(100);
      mailbox.remove(item);
      vi.advanceTimersByTime(100);
      mailbox.add(item);
      vi.advanceTimersByTime(100);
      mailbox.remove(item);
      vi.advanceTimersByTime(100);

      expect(addedCallback).toHaveBeenCalledTimes(2);
      expect(removedCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe("multiple callbacks", () => {
    it("should trigger all registered onAdded callbacks", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onAdded(callback1);
      mailbox.onAdded(callback2);
      mailbox.onAdded(callback3);

      mailbox.add(item);
      vi.advanceTimersByTime(100);

      expect(callback1).toHaveBeenCalledWith([item]);
      expect(callback2).toHaveBeenCalledWith([item]);
      expect(callback3).toHaveBeenCalledWith([item]);
    });

    it("should trigger all registered onRemoved callbacks", () => {
      const mailbox = new BufferedMailbox<TestItem>(100, 10);
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onRemoved(callback1);
      mailbox.onRemoved(callback2);
      mailbox.onRemoved(callback3);

      mailbox.add(item);
      vi.advanceTimersByTime(100);
      mailbox.remove(item);
      vi.advanceTimersByTime(100);

      expect(callback1).toHaveBeenCalledWith([item]);
      expect(callback2).toHaveBeenCalledWith([item]);
      expect(callback3).toHaveBeenCalledWith([item]);
    });
  });
});
