import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryKeyValueStore } from "../../src/cache/kv/kv-store.js";

describe("InMemoryKeyValueStore", () => {
  let store: InMemoryKeyValueStore;

  beforeEach(() => {
    store = new InMemoryKeyValueStore();
  });

  describe("get and put", () => {
    it("should store and retrieve values", async () => {
      await store.put("key1", "value1");
      const result = await store.get("key1");
      expect(result).toBe("value1");
    });

    it("should return undefined for missing keys", async () => {
      const result = await store.get("nonexistent");
      expect(result).toBeUndefined();
    });

    it("should overwrite existing values", async () => {
      await store.put("key1", "value1");
      await store.put("key1", "value2");
      const result = await store.get("key1");
      expect(result).toBe("value2");
    });

    it("should store multiple key-value pairs", async () => {
      await store.put("key1", "value1");
      await store.put("key2", "value2");
      await store.put("key3", "value3");

      expect(await store.get("key1")).toBe("value1");
      expect(await store.get("key2")).toBe("value2");
      expect(await store.get("key3")).toBe("value3");
    });

    it("should handle large string values", async () => {
      const largeValue = "x".repeat(100000);
      await store.put("large", largeValue);
      const result = await store.get("large");
      expect(result).toBe(largeValue);
    });
  });

  describe("delete", () => {
    it("should delete keys", async () => {
      await store.put("key1", "value1");
      await store.delete("key1");
      const result = await store.get("key1");
      expect(result).toBeUndefined();
    });

    it("should handle deletion of non-existent keys gracefully", async () => {
      await store.delete("nonexistent");
      const result = await store.get("nonexistent");
      expect(result).toBeUndefined();
    });

    it("should only delete specified key", async () => {
      await store.put("key1", "value1");
      await store.put("key2", "value2");
      await store.delete("key1");

      expect(await store.get("key1")).toBeUndefined();
      expect(await store.get("key2")).toBe("value2");
    });
  });

  describe("clear", () => {
    it("should clear all keys", async () => {
      await store.put("key1", "value1");
      await store.put("key2", "value2");
      await store.put("key3", "value3");

      await store.clear();

      expect(await store.get("key1")).toBeUndefined();
      expect(await store.get("key2")).toBeUndefined();
      expect(await store.get("key3")).toBeUndefined();
    });

    it("should handle clear on empty store", async () => {
      await store.clear();
      const result = await store.get("anykey");
      expect(result).toBeUndefined();
    });

    it("should allow operations after clear", async () => {
      await store.put("key1", "value1");
      await store.clear();
      await store.put("key2", "value2");

      expect(await store.get("key1")).toBeUndefined();
      expect(await store.get("key2")).toBe("value2");
    });
  });

  describe("startup and shutdown", () => {
    it("should handle startup", async () => {
      await store.startup();
      await store.put("key1", "value1");
      expect(await store.get("key1")).toBe("value1");
    });

    it("should handle shutdown", async () => {
      await store.put("key1", "value1");
      await store.shutdown();
      expect(await store.get("key1")).toBeUndefined();
    });

    it("should clear data on shutdown", async () => {
      await store.put("key1", "value1");
      await store.put("key2", "value2");
      await store.shutdown();

      expect(await store.get("key1")).toBeUndefined();
      expect(await store.get("key2")).toBeUndefined();
    });

    it("should work without explicit startup call", async () => {
      await store.put("key1", "value1");
      expect(await store.get("key1")).toBe("value1");
    });
  });

  describe("abort signal", () => {
    it("should respect abort signal in get", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(store.get("key1", controller.signal)).rejects.toThrow(
        "Operation aborted",
      );
    });

    it("should respect abort signal in put", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        store.put("key1", "value1", controller.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should respect abort signal in delete", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(store.delete("key1", controller.signal)).rejects.toThrow(
        "Operation aborted",
      );
    });

    it("should allow operation if signal is not aborted", async () => {
      const controller = new AbortController();

      await store.put("key1", "value1", controller.signal);
      const result = await store.get("key1", controller.signal);
      expect(result).toBe("value1");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string keys", async () => {
      await store.put("", "empty-key");
      expect(await store.get("")).toBe("empty-key");
    });

    it("should handle empty string values", async () => {
      await store.put("key1", "");
      expect(await store.get("key1")).toBe("");
    });

    it("should handle special characters in keys", async () => {
      const specialKey = "key:with:colons:and-dashes_and_underscores";
      await store.put(specialKey, "value");
      expect(await store.get(specialKey)).toBe("value");
    });

    it("should handle JSON-serialized values", async () => {
      const jsonValue = JSON.stringify({ foo: "bar", nested: { value: 42 } });
      await store.put("json-key", jsonValue);
      const result = await store.get("json-key");
      expect(result).toBe(jsonValue);
      expect(JSON.parse(result!)).toEqual({
        foo: "bar",
        nested: { value: 42 },
      });
    });
  });
});
