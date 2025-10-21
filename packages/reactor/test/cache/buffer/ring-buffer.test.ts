import { describe, expect, it } from "vitest";
import { RingBuffer } from "../../../src/cache/buffer/ring-buffer.js";

describe("RingBuffer", () => {
  describe("constructor", () => {
    it("should initialize with correct capacity", () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.length).toBe(0);
    });

    it("should throw error for invalid capacity", () => {
      expect(() => new RingBuffer<number>(0)).toThrow(
        "Ring buffer capacity must be greater than 0",
      );
      expect(() => new RingBuffer<number>(-1)).toThrow(
        "Ring buffer capacity must be greater than 0",
      );
    });

    it("should handle capacity of 1", () => {
      const buffer = new RingBuffer<number>(1);
      expect(buffer.length).toBe(0);
    });
  });

  describe("push", () => {
    it("should add items sequentially", () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.length).toBe(3);
      expect(buffer.getAll()).toEqual([1, 2, 3]);
    });

    it("should fill buffer to capacity", () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.length).toBe(3);
      expect(buffer.getAll()).toEqual([1, 2, 3]);
    });

    it("should overwrite oldest item when full", () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);

      expect(buffer.length).toBe(3);
      expect(buffer.getAll()).toEqual([2, 3, 4]);
    });

    it("should handle multiple overwrites", () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);
      buffer.push(6);

      expect(buffer.length).toBe(3);
      expect(buffer.getAll()).toEqual([4, 5, 6]);
    });

    it("should handle capacity=1 edge case", () => {
      const buffer = new RingBuffer<number>(1);
      buffer.push(1);
      expect(buffer.getAll()).toEqual([1]);

      buffer.push(2);
      expect(buffer.getAll()).toEqual([2]);

      buffer.push(3);
      expect(buffer.getAll()).toEqual([3]);
    });

    it("should work with different types", () => {
      const stringBuffer = new RingBuffer<string>(3);
      stringBuffer.push("a");
      stringBuffer.push("b");
      stringBuffer.push("c");
      expect(stringBuffer.getAll()).toEqual(["a", "b", "c"]);

      const objectBuffer = new RingBuffer<{ id: number }>(2);
      objectBuffer.push({ id: 1 });
      objectBuffer.push({ id: 2 });
      expect(objectBuffer.getAll()).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe("getAll", () => {
    it("should return empty array for empty buffer", () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.getAll()).toEqual([]);
    });

    it("should return items in chronological order", () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(10);
      buffer.push(20);
      buffer.push(30);
      buffer.push(40);
      buffer.push(50);

      expect(buffer.getAll()).toEqual([10, 20, 30, 40, 50]);
    });

    it("should return a new array each time", () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);

      const result1 = buffer.getAll();
      const result2 = buffer.getAll();

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });
  });

  describe("clear", () => {
    it("should clear all items", () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      buffer.clear();

      expect(buffer.length).toBe(0);
      expect(buffer.getAll()).toEqual([]);
    });

    it("should allow adding items after clear", () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      buffer.clear();

      buffer.push(10);
      buffer.push(20);

      expect(buffer.length).toBe(2);
      expect(buffer.getAll()).toEqual([10, 20]);
    });

    it("should handle clear on empty buffer", () => {
      const buffer = new RingBuffer<number>(5);
      buffer.clear();

      expect(buffer.length).toBe(0);
      expect(buffer.getAll()).toEqual([]);
    });

    it("should handle clear after wraparound", () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);

      buffer.clear();

      expect(buffer.length).toBe(0);
      expect(buffer.getAll()).toEqual([]);
    });
  });

  describe("length", () => {
    it("should track size correctly", () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.length).toBe(0);

      buffer.push(1);
      expect(buffer.length).toBe(1);

      buffer.push(2);
      expect(buffer.length).toBe(2);

      buffer.push(3);
      expect(buffer.length).toBe(3);
    });

    it("should not exceed capacity", () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      expect(buffer.length).toBe(3);

      buffer.push(4);
      expect(buffer.length).toBe(3);

      buffer.push(5);
      expect(buffer.length).toBe(3);
    });

    it("should reset to 0 after clear", () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      buffer.clear();

      expect(buffer.length).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle many overwrites", () => {
      const buffer = new RingBuffer<number>(10);
      for (let i = 0; i < 100; i++) {
        buffer.push(i);
      }

      expect(buffer.length).toBe(10);
      expect(buffer.getAll()).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
    });

    it("should handle null and undefined values", () => {
      const buffer = new RingBuffer<number | null | undefined>(3);
      buffer.push(1);
      buffer.push(null);
      buffer.push(undefined);

      expect(buffer.getAll()).toEqual([1, null, undefined]);
    });
  });
});
