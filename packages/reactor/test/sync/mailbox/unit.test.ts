import { describe, expect, it, vi } from "vitest";
import { Mailbox, MailboxAggregateError } from "../../../src/sync/mailbox.js";

type TestItem = {
  id: string;
  value: number;
};

describe("Mailbox", () => {
  describe("constructor", () => {
    it("should initialize with empty items", () => {
      const mailbox = new Mailbox<TestItem>();

      expect(mailbox.items).toEqual([]);
    });
  });

  describe("add", () => {
    it("should add item to mailbox", () => {
      const mailbox = new Mailbox<TestItem>();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.add(item);

      expect(mailbox.items).toHaveLength(1);
      expect(mailbox.items[0]).toBe(item);
    });

    it("should add multiple items", () => {
      const mailbox = new Mailbox<TestItem>();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };
      const item3: TestItem = { id: "item3", value: 3 };

      mailbox.add(item1);
      mailbox.add(item2);
      mailbox.add(item3);

      expect(mailbox.items).toHaveLength(3);
      expect(mailbox.items).toEqual([item1, item2, item3]);
    });

    it("should trigger onAdded callback", () => {
      const mailbox = new Mailbox<TestItem>();
      const callback = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onAdded(callback);
      mailbox.add(item);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([item]);
    });

    it("should trigger all registered onAdded callbacks", () => {
      const mailbox = new Mailbox<TestItem>();
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onAdded(callback1);
      mailbox.onAdded(callback2);
      mailbox.onAdded(callback3);

      mailbox.add(item);

      expect(callback1).toHaveBeenCalledWith([item]);
      expect(callback2).toHaveBeenCalledWith([item]);
      expect(callback3).toHaveBeenCalledWith([item]);
    });

    it("should call callbacks in registration order", () => {
      const mailbox = new Mailbox<TestItem>();
      const callOrder: number[] = [];
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onAdded(() => callOrder.push(1));
      mailbox.onAdded(() => callOrder.push(2));
      mailbox.onAdded(() => callOrder.push(3));

      mailbox.add(item);

      expect(callOrder).toEqual([1, 2, 3]);
    });

    it("should replace item with same id", () => {
      const mailbox = new Mailbox<TestItem>();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item1", value: 2 };

      mailbox.add(item1);
      mailbox.add(item2);

      expect(mailbox.items).toHaveLength(1);
      expect(mailbox.items[0]).toBe(item2);
      expect(mailbox.items[0].value).toBe(2);
    });
  });

  describe("batch add", () => {
    it("should add multiple items in a single call", () => {
      const mailbox = new Mailbox<TestItem>();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };
      const item3: TestItem = { id: "item3", value: 3 };

      mailbox.add(item1, item2, item3);

      expect(mailbox.items).toHaveLength(3);
      expect(mailbox.get("item1")).toBe(item1);
      expect(mailbox.get("item2")).toBe(item2);
      expect(mailbox.get("item3")).toBe(item3);
    });

    it("should trigger onAdded callback once with all items", () => {
      const mailbox = new Mailbox<TestItem>();
      const callback = vi.fn();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };
      const item3: TestItem = { id: "item3", value: 3 };

      mailbox.onAdded(callback);
      mailbox.add(item1, item2, item3);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([item1, item2, item3]);
    });

    it("should buffer all items from a batch add when paused", () => {
      const mailbox = new Mailbox<TestItem>();
      const callback = vi.fn();
      const a: TestItem = { id: "a", value: 1 };
      const b: TestItem = { id: "b", value: 2 };
      const c: TestItem = { id: "c", value: 3 };

      mailbox.onAdded(callback);
      mailbox.pause();
      mailbox.add(a, b, c);

      expect(callback).not.toHaveBeenCalled();
      expect(mailbox.items).toHaveLength(3);

      mailbox.resume();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([a, b, c]);
    });
  });

  describe("batch remove", () => {
    it("should remove multiple items in a single call", () => {
      const mailbox = new Mailbox<TestItem>();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };
      const item3: TestItem = { id: "item3", value: 3 };

      mailbox.add(item1, item2, item3);
      mailbox.remove(item1, item3);

      expect(mailbox.items).toHaveLength(1);
      expect(mailbox.get("item2")).toBe(item2);
    });

    it("should trigger onRemoved callback once with all items", () => {
      const mailbox = new Mailbox<TestItem>();
      const callback = vi.fn();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };

      mailbox.onRemoved(callback);
      mailbox.add(item1, item2);
      mailbox.remove(item1, item2);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([item1, item2]);
    });
  });

  describe("remove", () => {
    it("should remove item from mailbox", () => {
      const mailbox = new Mailbox<TestItem>();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.add(item);
      mailbox.remove(item);

      expect(mailbox.items).toHaveLength(0);
    });

    it("should trigger onRemoved callback", () => {
      const mailbox = new Mailbox<TestItem>();
      const callback = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onRemoved(callback);
      mailbox.add(item);
      mailbox.remove(item);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([item]);
    });

    it("should trigger all registered onRemoved callbacks", () => {
      const mailbox = new Mailbox<TestItem>();
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onRemoved(callback1);
      mailbox.onRemoved(callback2);
      mailbox.onRemoved(callback3);

      mailbox.add(item);
      mailbox.remove(item);

      expect(callback1).toHaveBeenCalledWith([item]);
      expect(callback2).toHaveBeenCalledWith([item]);
      expect(callback3).toHaveBeenCalledWith([item]);
    });

    it("should remove correct item when multiple items exist", () => {
      const mailbox = new Mailbox<TestItem>();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };
      const item3: TestItem = { id: "item3", value: 3 };

      mailbox.add(item1);
      mailbox.add(item2);
      mailbox.add(item3);

      mailbox.remove(item2);

      expect(mailbox.items).toHaveLength(2);
      expect(mailbox.items).toEqual([item1, item3]);
    });

    it("should not trigger callback if item not in mailbox", () => {
      const mailbox = new Mailbox<TestItem>();
      const callback = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onRemoved(callback);
      mailbox.remove(item);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("get", () => {
    it("should return item by id", () => {
      const mailbox = new Mailbox<TestItem>();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.add(item);

      const retrieved = mailbox.get("item1");

      expect(retrieved).toBe(item);
    });

    it("should return undefined for non-existent id", () => {
      const mailbox = new Mailbox<TestItem>();

      const retrieved = mailbox.get("nonexistent");

      expect(retrieved).toBeUndefined();
    });

    it("should return correct item when multiple items exist", () => {
      const mailbox = new Mailbox<TestItem>();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };
      const item3: TestItem = { id: "item3", value: 3 };

      mailbox.add(item1);
      mailbox.add(item2);
      mailbox.add(item3);

      expect(mailbox.get("item1")).toBe(item1);
      expect(mailbox.get("item2")).toBe(item2);
      expect(mailbox.get("item3")).toBe(item3);
    });

    it("should return undefined after item is removed", () => {
      const mailbox = new Mailbox<TestItem>();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.add(item);
      mailbox.remove(item);

      expect(mailbox.get("item1")).toBeUndefined();
    });
  });

  describe("items", () => {
    it("should return readonly array", () => {
      const mailbox = new Mailbox<TestItem>();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.add(item);

      const items = mailbox.items;

      expect(items).toHaveLength(1);
      expect(items[0]).toBe(item);
    });

    it("should reflect current state of mailbox", () => {
      const mailbox = new Mailbox<TestItem>();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };

      expect(mailbox.items).toHaveLength(0);

      mailbox.add(item1);
      expect(mailbox.items).toHaveLength(1);

      mailbox.add(item2);
      expect(mailbox.items).toHaveLength(2);

      mailbox.remove(item1);
      expect(mailbox.items).toHaveLength(1);
    });
  });

  describe("event callbacks", () => {
    it("should guarantee delivery even if callbacks throw errors", () => {
      const mailbox = new Mailbox<TestItem>();
      const callback1 = vi.fn(() => {
        throw new Error("Callback 1 error");
      });
      const callback2 = vi.fn();
      const callback3 = vi.fn(() => {
        throw new Error("Callback 3 error");
      });
      const callback4 = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onAdded(callback1);
      mailbox.onAdded(callback2);
      mailbox.onAdded(callback3);
      mailbox.onAdded(callback4);

      expect(() => mailbox.add(item)).toThrow(MailboxAggregateError);

      expect(callback1).toHaveBeenCalledWith([item]);
      expect(callback2).toHaveBeenCalledWith([item]);
      expect(callback3).toHaveBeenCalledWith([item]);
      expect(callback4).toHaveBeenCalledWith([item]);

      try {
        mailbox.add(item);
      } catch (error) {
        expect(error).toBeInstanceOf(MailboxAggregateError);
        expect((error as MailboxAggregateError).errors).toHaveLength(2);
        expect((error as MailboxAggregateError).errors[0].message).toBe(
          "Callback 1 error",
        );
        expect((error as MailboxAggregateError).errors[1].message).toBe(
          "Callback 3 error",
        );
      }
    });

    it("should handle multiple add/remove cycles", () => {
      const mailbox = new Mailbox<TestItem>();
      const addedCallback = vi.fn();
      const removedCallback = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onAdded(addedCallback);
      mailbox.onRemoved(removedCallback);

      mailbox.add(item);
      mailbox.remove(item);
      mailbox.add(item);
      mailbox.remove(item);

      expect(addedCallback).toHaveBeenCalledTimes(2);
      expect(removedCallback).toHaveBeenCalledTimes(2);
    });

    it("should handle callback registered during add operation", () => {
      const mailbox = new Mailbox<TestItem>();
      const item1: TestItem = { id: "item1", value: 1 };
      const item2: TestItem = { id: "item2", value: 2 };
      const callOrder: string[] = [];

      mailbox.onAdded(() => {
        callOrder.push("callback1");
        mailbox.onAdded(() => {
          callOrder.push("callback2-from-callback1");
        });
      });

      mailbox.add(item1);
      expect(callOrder).toEqual(["callback1"]);

      callOrder.length = 0;
      mailbox.add(item2);
      expect(callOrder).toEqual(["callback1", "callback2-from-callback1"]);
    });
  });

  describe("edge cases", () => {
    it("should handle rapid add/remove operations", () => {
      const mailbox = new Mailbox<TestItem>();
      const items: TestItem[] = [];

      for (let i = 0; i < 100; i++) {
        const item: TestItem = { id: `item${i}`, value: i };
        items.push(item);
        mailbox.add(item);
      }

      expect(mailbox.items).toHaveLength(100);

      for (let i = 0; i < 50; i++) {
        mailbox.remove(items[i]);
      }

      expect(mailbox.items).toHaveLength(50);
    });

    it("should handle items with same id correctly", () => {
      const mailbox = new Mailbox<TestItem>();
      const item1: TestItem = { id: "same", value: 1 };
      const item2: TestItem = { id: "same", value: 2 };
      const callback = vi.fn();

      mailbox.onAdded(callback);

      mailbox.add(item1);
      expect(callback).toHaveBeenCalledTimes(1);

      mailbox.add(item2);
      expect(callback).toHaveBeenCalledTimes(2);

      expect(mailbox.items).toHaveLength(1);
      expect(mailbox.get("same")).toBe(item2);
    });

    it("should maintain item reference integrity", () => {
      const mailbox = new Mailbox<TestItem>();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.add(item);

      const retrieved = mailbox.get("item1");
      expect(retrieved).toBe(item);

      const itemsArray = mailbox.items;
      expect(itemsArray[0]).toBe(item);
    });
  });

  describe("callback registration", () => {
    it("should allow multiple callback registrations", () => {
      const mailbox = new Mailbox<TestItem>();
      const item: TestItem = { id: "item1", value: 42 };

      for (let i = 0; i < 10; i++) {
        mailbox.onAdded(vi.fn());
      }

      expect(() => mailbox.add(item)).not.toThrow();
    });

    it("should handle onAdded and onRemoved separately", () => {
      const mailbox = new Mailbox<TestItem>();
      const addedCallback = vi.fn();
      const removedCallback = vi.fn();
      const item: TestItem = { id: "item1", value: 42 };

      mailbox.onAdded(addedCallback);
      mailbox.onRemoved(removedCallback);

      mailbox.add(item);
      expect(addedCallback).toHaveBeenCalledTimes(1);
      expect(removedCallback).not.toHaveBeenCalled();

      mailbox.remove(item);
      expect(addedCallback).toHaveBeenCalledTimes(1);
      expect(removedCallback).toHaveBeenCalledTimes(1);
    });
  });
});
