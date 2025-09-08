import { describe, expect, it } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { type IEventBus } from "../src/events/interfaces.js";
import { EventBusAggregateError } from "../src/events/types.js";

type TestEvent = {
  emitId?: string;
  value?: number;
};

describe("EventBus", () => {
  describe("order of subscriber execution", () => {
    it("should execute subscribers in registration order", async () => {
      const eventBus = new EventBus();
      const executionOrder: number[] = [];
      const eventType = 1;

      // Register subscribers in specific order
      eventBus.subscribe(eventType, () => {
        executionOrder.push(1);
      });

      eventBus.subscribe(eventType, () => {
        executionOrder.push(2);
      });

      eventBus.subscribe(eventType, () => {
        executionOrder.push(3);
      });

      await eventBus.emit(eventType, {});

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it("should maintain order even with async subscribers", async () => {
      const eventBus = new EventBus();
      const executionOrder: number[] = [];
      const eventType = 1;

      // Mix of sync and async subscribers with different delays
      eventBus.subscribe(eventType, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionOrder.push(1);
      });

      eventBus.subscribe(eventType, () => {
        executionOrder.push(2);
      });

      eventBus.subscribe(eventType, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(3);
      });

      await eventBus.emit(eventType, {});

      // With sequential execution, order should be preserved regardless of delays
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it("should preserve order when subscribers are added during emission", async () => {
      const eventBus = new EventBus();
      const executionOrder: number[] = [];
      const eventType = 1;

      eventBus.subscribe(eventType, () => {
        executionOrder.push(1);
        // Add a new subscriber during emission
        eventBus.subscribe(eventType, () => {
          executionOrder.push(4);
        });
      });

      eventBus.subscribe(eventType, () => {
        executionOrder.push(2);
      });

      eventBus.subscribe(eventType, () => {
        executionOrder.push(3);
      });

      await eventBus.emit(eventType, {});

      // The subscriber added during emission should not be called in this cycle
      expect(executionOrder).toEqual([1, 2, 3]);

      // But should be called in the next emission
      executionOrder.length = 0;
      await eventBus.emit(eventType, {});
      expect(executionOrder).toEqual([1, 2, 3, 4]);
    });
  });

  describe("concurrent emits", () => {
    it("should handle multiple concurrent emits without blocking", async () => {
      const eventBus = new EventBus();
      const results: Array<{
        eventType: number;
        data: any;
        timestampUtcMs: number;
      }> = [];
      const eventType1 = 1;
      const eventType2 = 2;

      // Subscriber for event type 1 with delay
      eventBus.subscribe<TestEvent>(
        eventType1,
        async (type, data: TestEvent) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          results.push({ eventType: type, data, timestampUtcMs: Date.now() });
        },
      );

      // Subscriber for event type 2 with shorter delay
      eventBus.subscribe<TestEvent>(
        eventType2,
        async (type, data: TestEvent) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          results.push({ eventType: type, data, timestampUtcMs: Date.now() });
        },
      );

      const startTime = Date.now();

      // Emit both events concurrently
      const [result1, result2] = await Promise.all([
        eventBus.emit(eventType1, { message: "event1" }),
        eventBus.emit(eventType2, { message: "event2" }),
      ]);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Both emits should complete
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();

      // Should have results for both events
      expect(results).toHaveLength(2);

      // Event 2 should complete first due to shorter delay
      expect(results[0].eventType).toBe(2);
      expect(results[1].eventType).toBe(1);

      // Total time should be closer to 100ms (longer delay) than 150ms (sum of delays)
      // This proves they ran concurrently
      expect(totalTime).toBeLessThan(150);
      expect(totalTime).toBeGreaterThan(90);
    });

    it("should handle concurrent emits of the same event type", async () => {
      const eventBus = new EventBus();
      const results: Array<{
        emitId: string;
        subscriberId: number;
        timestampUtcMs: number;
      }> = [];
      const eventType = 1;

      // Multiple subscribers with different delays
      eventBus.subscribe<TestEvent>(
        eventType,
        async (type, data: TestEvent) => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          results.push({
            emitId: data.emitId ?? "",
            subscriberId: 1,
            timestampUtcMs: Date.now(),
          });
        },
      );

      eventBus.subscribe<TestEvent>(
        eventType,
        async (type, data: TestEvent) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          results.push({
            emitId: data.emitId ?? "",
            subscriberId: 2,
            timestampUtcMs: Date.now(),
          });
        },
      );

      // Emit the same event type concurrently
      await Promise.all([
        eventBus.emit(eventType, { emitId: "emit1" }),
        eventBus.emit(eventType, { emitId: "emit2" }),
        eventBus.emit(eventType, { emitId: "emit3" }),
      ]);

      // Should have 6 results total (3 emits × 2 subscribers)
      expect(results).toHaveLength(6);

      // Each emit should have triggered both subscribers
      const emit1Results = results.filter((r) => r.emitId === "emit1");
      const emit2Results = results.filter((r) => r.emitId === "emit2");
      const emit3Results = results.filter((r) => r.emitId === "emit3");

      expect(emit1Results).toHaveLength(2);
      expect(emit2Results).toHaveLength(2);
      expect(emit3Results).toHaveLength(2);
    });
  });

  describe("sync and async subscribers", () => {
    it("should handle mix of synchronous and asynchronous subscribers", async () => {
      const eventBus = new EventBus();
      const results: Array<{ type: string; value: number }> = [];
      const eventType = 1;

      // Synchronous subscriber
      eventBus.subscribe<TestEvent>(eventType, (type, data: TestEvent) => {
        results.push({ type: "sync", value: data.value ?? 0 });
      });

      // Asynchronous subscriber
      eventBus.subscribe<TestEvent>(
        eventType,
        async (type, data: TestEvent) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          results.push({ type: "async", value: data.value ?? 0 });
        },
      );

      // Another synchronous subscriber
      eventBus.subscribe<TestEvent>(eventType, (type, data: TestEvent) => {
        results.push({ type: "sync2", value: data.value ?? 0 });
      });

      await eventBus.emit(eventType, { value: 42 });

      expect(results).toHaveLength(3);
      // With sequential execution, all subscribers complete in registration order
      expect(results[0]).toEqual({ type: "sync", value: 42 });
      expect(results[1]).toEqual({ type: "async", value: 42 });
      expect(results[2]).toEqual({ type: "sync2", value: 42 });
    });

    it("should handle subscribers that return promises vs void", async () => {
      const eventBus = new EventBus();
      const results: string[] = [];
      const eventType = 1;

      // Subscriber returning void
      eventBus.subscribe<TestEvent>(eventType, () => {
        results.push("void");
      });

      // Subscriber returning Promise<void>
      eventBus.subscribe<TestEvent>(eventType, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push("promise-void");
      });

      // Subscriber returning a value (should be ignored)
      eventBus.subscribe<TestEvent>(eventType, () => {
        results.push("value");
        // Don't return anything to avoid type error
      });

      await eventBus.emit(eventType, {});

      // With sequential execution, all complete in registration order
      expect(results).toEqual(["void", "promise-void", "value"]);
    });

    it("should handle synchronous errors in async context", async () => {
      const eventBus = new EventBus();
      const eventType = 1;

      eventBus.subscribe<TestEvent>(eventType, () => {
        throw new Error("Sync error");
      });

      eventBus.subscribe<TestEvent>(eventType, () => {
        throw new Error("Async error");
      });

      await expect(eventBus.emit(eventType, {})).rejects.toThrow(
        EventBusAggregateError,
      );

      try {
        await eventBus.emit(eventType, {});
      } catch (error) {
        expect(error).toBeInstanceOf(EventBusAggregateError);
        expect((error as EventBusAggregateError).errors).toHaveLength(2);
        expect(
          ((error as EventBusAggregateError).errors[0] as Error).message,
        ).toBe("Sync error");
        expect(
          ((error as EventBusAggregateError).errors[1] as Error).message,
        ).toBe("Async error");
      }
    });
  });

  describe("unsubscribe safety", () => {
    it("should be safe to call unsubscribe multiple times", () => {
      const eventBus = new EventBus();
      const eventType = 1;
      let callCount = 0;

      const unsubscribe = eventBus.subscribe<TestEvent>(eventType, () => {
        callCount++;
      });

      // Call unsubscribe multiple times
      unsubscribe();
      unsubscribe();
      unsubscribe();

      // Should not throw and should work correctly
      expect(() => unsubscribe()).not.toThrow();
    });

    it("should handle unsubscribe during emission", async () => {
      const eventBus = new EventBus();
      const results: number[] = [];
      const eventType = 1;

      let unsubscribe2: (() => void) | undefined = undefined;

      eventBus.subscribe<TestEvent>(eventType, () => {
        results.push(1);
        // Unsubscribe subscriber 2 during emission
        if (unsubscribe2) {
          unsubscribe2();
        }
      });

      unsubscribe2 = eventBus.subscribe<TestEvent>(eventType, () => {
        results.push(2);
      });

      eventBus.subscribe(eventType, () => {
        results.push(3);
      });

      await eventBus.emit(eventType, {});

      // Subscriber 2 should still be called since it was registered before emission started
      expect(results).toEqual([1, 2, 3]);

      // But should not be called in subsequent emissions
      results.length = 0;
      await eventBus.emit(eventType, {});
      expect(results).toEqual([1, 3]);
    });

    it("should clean up empty listener arrays", async () => {
      const eventBus = new EventBus();
      const eventType = 1;

      const unsubscribe1 = eventBus.subscribe(eventType, () => {});
      const unsubscribe2 = eventBus.subscribe(eventType, () => {});

      // Verify listeners exist
      expect(eventBus.eventTypeToSubscribers.has(eventType)).toBe(true);
      expect(eventBus.eventTypeToSubscribers.get(eventType)).toHaveLength(2);

      // Unsubscribe first subscriber
      unsubscribe1();
      expect(eventBus.eventTypeToSubscribers.get(eventType)).toHaveLength(1);

      // Unsubscribe last subscriber - should clean up the map entry
      unsubscribe2();
      expect(eventBus.eventTypeToSubscribers.has(eventType)).toBe(false);
    });

    it("should handle unsubscribe of non-existent subscriber gracefully", () => {
      const eventBus = new EventBus();
      const eventType = 1;

      const unsubscribe = eventBus.subscribe(eventType, () => {});

      // Manually remove the subscriber to simulate edge case
      const listeners = eventBus.eventTypeToSubscribers.get(eventType);
      if (!listeners) {
        throw new Error("Listeners not found");
      }

      listeners.length = 0;

      // Should not throw
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should not affect other subscribers when one throws", async () => {
      const eventBus = new EventBus();
      const results: number[] = [];
      const eventType = 1;

      eventBus.subscribe(eventType, () => {
        results.push(1);
      });

      eventBus.subscribe(eventType, () => {
        throw new Error("Subscriber 2 error");
      });

      eventBus.subscribe(eventType, () => {
        results.push(3);
      });

      eventBus.subscribe(eventType, async () => {
        throw new Error("Subscriber 4 error");
      });

      eventBus.subscribe(eventType, () => {
        results.push(5);
      });

      await expect(eventBus.emit(eventType, {})).rejects.toThrow(
        EventBusAggregateError,
      );

      // All non-throwing subscribers should have been called
      expect(results).toEqual([1, 3, 5]);

      // Verify the aggregate error contains both errors
      try {
        await eventBus.emit(eventType, {});
      } catch (error) {
        expect(error).toBeInstanceOf(EventBusAggregateError);
        expect((error as EventBusAggregateError).errors).toHaveLength(2);
        expect(
          ((error as EventBusAggregateError).errors[0] as Error).message,
        ).toBe("Subscriber 2 error");
        expect(
          ((error as EventBusAggregateError).errors[1] as Error).message,
        ).toBe("Subscriber 4 error");
      }
    });

    it("should throw aggregate error when multiple subscribers throw", async () => {
      const eventBus = new EventBus();
      const eventType = 1;

      eventBus.subscribe(eventType, () => {
        throw new Error("First error");
      });

      eventBus.subscribe(eventType, () => {
        throw new Error("Second error");
      });

      eventBus.subscribe(eventType, async () => {
        throw new Error("Third error");
      });

      await expect(eventBus.emit(eventType, {})).rejects.toThrow(
        EventBusAggregateError,
      );

      try {
        await eventBus.emit(eventType, {});
      } catch (error) {
        expect(error).toBeInstanceOf(EventBusAggregateError);
        expect((error as EventBusAggregateError).errors).toHaveLength(3);
        expect(
          ((error as EventBusAggregateError).errors[0] as Error).message,
        ).toBe("First error");
        expect(
          ((error as EventBusAggregateError).errors[1] as Error).message,
        ).toBe("Second error");
        expect(
          ((error as EventBusAggregateError).errors[2] as Error).message,
        ).toBe("Third error");
      }
    });

    it("should handle async errors correctly", async () => {
      const eventBus = new EventBus();
      const results: string[] = [];
      const eventType = 1;

      eventBus.subscribe(eventType, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push("success1");
      });

      eventBus.subscribe(eventType, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error("Async error");
      });

      eventBus.subscribe(eventType, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        results.push("success2");
      });

      await expect(eventBus.emit(eventType, {})).rejects.toThrow(
        EventBusAggregateError,
      );

      // All subscribers run sequentially, even if earlier ones throw errors
      expect(results).toEqual(["success1", "success2"]);

      // Verify the aggregate error contains the async error
      try {
        await eventBus.emit(eventType, {});
      } catch (error) {
        expect(error).toBeInstanceOf(EventBusAggregateError);
        expect((error as EventBusAggregateError).errors).toHaveLength(1);
        expect(
          ((error as EventBusAggregateError).errors[0] as Error).message,
        ).toBe("Async error");
      }
    });

    it("should handle mixed sync and async errors", async () => {
      const eventBus = new EventBus();
      const results: string[] = [];
      const eventType = 1;

      eventBus.subscribe(eventType, () => {
        results.push("sync-success");
      });

      eventBus.subscribe(eventType, () => {
        throw new Error("Sync error");
      });

      eventBus.subscribe(eventType, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push("async-success");
      });

      eventBus.subscribe(eventType, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("Async error");
      });

      await expect(eventBus.emit(eventType, {})).rejects.toThrow(
        EventBusAggregateError,
      );

      // Non-throwing subscribers should complete
      expect(results).toEqual(["sync-success", "async-success"]);

      // Verify the aggregate error contains both sync and async errors
      try {
        await eventBus.emit(eventType, {});
      } catch (error) {
        expect(error).toBeInstanceOf(EventBusAggregateError);
        expect((error as EventBusAggregateError).errors).toHaveLength(2);
        expect(
          ((error as EventBusAggregateError).errors[0] as Error).message,
        ).toBe("Sync error");
        expect(
          ((error as EventBusAggregateError).errors[1] as Error).message,
        ).toBe("Async error");
      }
    });

    it("should continue processing other event types when one fails", async () => {
      const eventBus = new EventBus();
      const results: Array<{ eventType: number; success: boolean }> = [];

      eventBus.subscribe(1, () => {
        results.push({ eventType: 1, success: true });
        throw new Error("Event 1 error");
      });

      eventBus.subscribe(2, () => {
        results.push({ eventType: 2, success: true });
      });

      // Emit both events concurrently
      const [result1, result2] = await Promise.allSettled([
        eventBus.emit(1, {}),
        eventBus.emit(2, {}),
      ]);

      expect(result1.status).toBe("rejected");
      expect(result2.status).toBe("fulfilled");
      expect(results).toHaveLength(2);
    });
  });

  describe("edge cases", () => {
    it("should handle emit with no subscribers", async () => {
      const eventBus = new EventBus();

      // Should not throw and should complete immediately
      await expect(
        eventBus.emit(999, { data: "test" }),
      ).resolves.toBeUndefined();
    });

    it("should handle different event types independently", async () => {
      const eventBus = new EventBus();
      const results: Array<{ eventType: number; data: any }> = [];

      eventBus.subscribe(1, (type, data) => {
        results.push({ eventType: type, data });
      });

      eventBus.subscribe(2, (type, data) => {
        results.push({ eventType: type, data });
      });

      await eventBus.emit(1, { message: "type1" });
      await eventBus.emit(2, { message: "type2" });
      await eventBus.emit(3, { message: "type3" }); // No subscribers

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ eventType: 1, data: { message: "type1" } });
      expect(results[1]).toEqual({ eventType: 2, data: { message: "type2" } });
    });

    it("should handle rapid subscribe/unsubscribe cycles", async () => {
      const eventBus = new EventBus();
      const eventType = 1;
      const results: number[] = [];

      // Rapid subscribe/unsubscribe
      for (let i = 0; i < 100; i++) {
        const unsubscribe = eventBus.subscribe(eventType, () => {
          results.push(i);
        });

        if (i % 2 === 0) {
          unsubscribe();
        }
      }

      await eventBus.emit(eventType, {});

      // Should only have results from odd-numbered subscribers (not unsubscribed)
      expect(results).toHaveLength(50);
      expect(results.every((n) => n % 2 === 1)).toBe(true);
    });

    it("should maintain type safety with generic subscriber types", async () => {
      const eventBus: IEventBus = new EventBus();
      const eventType = 1;

      interface TestEvent {
        id: string;
        value: number;
      }

      const results: TestEvent[] = [];

      eventBus.subscribe<TestEvent>(eventType, (type, event) => {
        // TypeScript should infer event as TestEvent
        results.push(event);
      });

      const testEvent: TestEvent = { id: "test", value: 42 };
      await eventBus.emit(eventType, testEvent);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(testEvent);
    });
  });

  describe("performance characteristics", () => {
    it("should handle large numbers of subscribers efficiently", async () => {
      const eventBus = new EventBus();
      const eventType = 1;
      const subscriberCount = 1000;
      let callCount = 0;

      // Add many subscribers
      for (let i = 0; i < subscriberCount; i++) {
        eventBus.subscribe(eventType, () => {
          callCount++;
        });
      }

      const startTime = Date.now();
      await eventBus.emit(eventType, {});
      const endTime = Date.now();

      expect(callCount).toBe(subscriberCount);

      // Should complete reasonably quickly (less than 100ms for 1000 subscribers)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should handle many concurrent emits efficiently", async () => {
      const eventBus = new EventBus();
      const eventType = 1;
      const emitCount = 100;
      let totalCalls = 0;

      eventBus.subscribe(eventType, () => {
        totalCalls++;
      });

      const startTime = Date.now();

      const promises = Array.from({ length: emitCount }, () =>
        eventBus.emit(eventType, {}),
      );

      await Promise.all(promises);

      const endTime = Date.now();

      expect(totalCalls).toBe(emitCount);

      // Should complete reasonably quickly
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});

describe("EventBusAggregateError", () => {
  it("should create aggregate error with proper message and errors array", () => {
    const error1 = new Error("First error");
    const error2 = new Error("Second error");
    const error3 = "String error";

    const aggregateError = new EventBusAggregateError([error1, error2, error3]);

    expect(aggregateError).toBeInstanceOf(Error);
    expect(aggregateError).toBeInstanceOf(EventBusAggregateError);
    expect(aggregateError.name).toBe("EventBusAggregateError");
    expect(aggregateError.errors).toEqual([error1, error2, error3]);
    expect(aggregateError.message).toBe(
      "EventBus emit failed with 3 error(s): First error; Second error; String error",
    );
  });

  it("should handle errors without message property", () => {
    const error1 = new Error("Has message");
    const error2 = { code: "NO_MESSAGE" };
    const error3 = null;

    const aggregateError = new EventBusAggregateError([error1, error2, error3]);

    expect(aggregateError.errors).toHaveLength(3);
    expect(aggregateError.message).toContain("Has message");
    expect(aggregateError.message).toContain("[object Object]");
    expect(aggregateError.message).toContain("null");
  });
});
