import { bench, describe } from "vitest";
import { EventBus } from "../src/events/event-bus.js";

// Event types for testing
const EVENT_TYPE_SYNC = 1;
const EVENT_TYPE_ASYNC = 2;
const EVENT_TYPE_MIXED = 3;

// Test data
const TEST_DATA = { message: "test event", timestampUtcMs: Date.now() };

/**
 * Creates a synchronous subscriber that performs minimal work
 */
function createSyncSubscriber(id: string) {
  return (type: number, data: any) => {
    // Minimal synchronous work
    const result = data.timestampUtcMs + id.length;
    return result;
  };
}

/**
 * Creates an asynchronous subscriber with configurable delay
 */
function createAsyncSubscriber(id: string, delayMs = 0) {
  return async (type: number, data: any) => {
    // Simulate async work
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return data.timestampUtcMs + id.length;
  };
}

/**
 * Creates a subscriber that randomly decides to be sync or async
 */
function createMixedSubscriber(id: string, asyncProbability = 0.5) {
  return async (type: number, data: any) => {
    if (Math.random() < asyncProbability) {
      // Async path with minimal delay
      await new Promise((resolve) => setImmediate(resolve));
      return data.timestampUtcMs + id.length;
    } else {
      // Sync path
      return data.timestampUtcMs + id.length;
    }
  };
}

/**
 * Sets up an EventBus with multiple sync subscribers
 */
function setupSyncEventBus(subscriberCount: number): EventBus {
  const eventBus = new EventBus();

  for (let i = 0; i < subscriberCount; i++) {
    eventBus.subscribe(EVENT_TYPE_SYNC, createSyncSubscriber(`sync-${i}`));
  }

  return eventBus;
}

/**
 * Sets up an EventBus with multiple async subscribers
 */
function setupAsyncEventBus(subscriberCount: number, delayMs = 0): EventBus {
  const eventBus = new EventBus();

  for (let i = 0; i < subscriberCount; i++) {
    eventBus.subscribe(
      EVENT_TYPE_ASYNC,
      createAsyncSubscriber(`async-${i}`, delayMs),
    );
  }

  return eventBus;
}

/**
 * Sets up an EventBus with mixed sync/async subscribers
 */
function setupMixedEventBus(
  subscriberCount: number,
  asyncProbability = 0.5,
): EventBus {
  const eventBus = new EventBus();

  for (let i = 0; i < subscriberCount; i++) {
    eventBus.subscribe(
      EVENT_TYPE_MIXED,
      createMixedSubscriber(`mixed-${i}`, asyncProbability),
    );
  }

  return eventBus;
}

describe("EventBus Sync Emission Throughput", () => {
  const syncEventBus1 = setupSyncEventBus(1);
  const syncEventBus5 = setupSyncEventBus(5);
  const syncEventBus10 = setupSyncEventBus(10);
  const syncEventBus25 = setupSyncEventBus(25);
  const syncEventBus50 = setupSyncEventBus(50);
  const syncEventBus100 = setupSyncEventBus(100);

  bench(
    "1 sync subscriber",
    async () => {
      await syncEventBus1.emit(EVENT_TYPE_SYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "5 sync subscribers",
    async () => {
      await syncEventBus5.emit(EVENT_TYPE_SYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "10 sync subscribers",
    async () => {
      await syncEventBus10.emit(EVENT_TYPE_SYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "25 sync subscribers",
    async () => {
      await syncEventBus25.emit(EVENT_TYPE_SYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "50 sync subscribers",
    async () => {
      await syncEventBus50.emit(EVENT_TYPE_SYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "100 sync subscribers",
    async () => {
      await syncEventBus100.emit(EVENT_TYPE_SYNC, TEST_DATA);
    },
    { time: 500 },
  );
});

describe("EventBus Async Emission Throughput", () => {
  const asyncEventBus1_0ms = setupAsyncEventBus(1, 0);
  const asyncEventBus5_0ms = setupAsyncEventBus(5, 0);
  const asyncEventBus10_0ms = setupAsyncEventBus(10, 0);
  const asyncEventBus1_1ms = setupAsyncEventBus(1, 1);
  const asyncEventBus5_1ms = setupAsyncEventBus(5, 1);
  const asyncEventBus10_1ms = setupAsyncEventBus(10, 1);
  const asyncEventBus1_5ms = setupAsyncEventBus(1, 5);
  const asyncEventBus5_5ms = setupAsyncEventBus(5, 5);

  bench(
    "1 async subscriber (0ms delay)",
    async () => {
      await asyncEventBus1_0ms.emit(EVENT_TYPE_ASYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "5 async subscribers (0ms delay)",
    async () => {
      await asyncEventBus5_0ms.emit(EVENT_TYPE_ASYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "10 async subscribers (0ms delay)",
    async () => {
      await asyncEventBus10_0ms.emit(EVENT_TYPE_ASYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "1 async subscriber (1ms delay)",
    async () => {
      await asyncEventBus1_1ms.emit(EVENT_TYPE_ASYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "5 async subscribers (1ms delay)",
    async () => {
      await asyncEventBus5_1ms.emit(EVENT_TYPE_ASYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "10 async subscribers (1ms delay)",
    async () => {
      await asyncEventBus10_1ms.emit(EVENT_TYPE_ASYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "1 async subscriber (5ms delay)",
    async () => {
      await asyncEventBus1_5ms.emit(EVENT_TYPE_ASYNC, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "5 async subscribers (5ms delay)",
    async () => {
      await asyncEventBus5_5ms.emit(EVENT_TYPE_ASYNC, TEST_DATA);
    },
    { time: 500 },
  );
});

describe("EventBus Mixed Sync/Async Emission Throughput", () => {
  const mixedEventBus10_10 = setupMixedEventBus(10, 0.1);
  const mixedEventBus10_30 = setupMixedEventBus(10, 0.3);
  const mixedEventBus10_50 = setupMixedEventBus(10, 0.5);
  const mixedEventBus10_70 = setupMixedEventBus(10, 0.7);
  const mixedEventBus10_90 = setupMixedEventBus(10, 0.9);
  const mixedEventBus25_50 = setupMixedEventBus(25, 0.5);
  const mixedEventBus50_50 = setupMixedEventBus(50, 0.5);

  bench(
    "10 subscribers (90% sync, 10% async)",
    async () => {
      await mixedEventBus10_10.emit(EVENT_TYPE_MIXED, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "10 subscribers (70% sync, 30% async)",
    async () => {
      await mixedEventBus10_30.emit(EVENT_TYPE_MIXED, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "10 subscribers (50% sync, 50% async)",
    async () => {
      await mixedEventBus10_50.emit(EVENT_TYPE_MIXED, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "10 subscribers (30% sync, 70% async)",
    async () => {
      await mixedEventBus10_70.emit(EVENT_TYPE_MIXED, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "10 subscribers (10% sync, 90% async)",
    async () => {
      await mixedEventBus10_90.emit(EVENT_TYPE_MIXED, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "25 subscribers (50% sync, 50% async)",
    async () => {
      await mixedEventBus25_50.emit(EVENT_TYPE_MIXED, TEST_DATA);
    },
    { time: 500 },
  );

  bench(
    "50 subscribers (50% sync, 50% async)",
    async () => {
      await mixedEventBus50_50.emit(EVENT_TYPE_MIXED, TEST_DATA);
    },
    { time: 500 },
  );
});

describe("EventBus Subscription Management Performance", () => {
  bench(
    "Subscribe and unsubscribe (single)",
    () => {
      const eventBus = new EventBus();
      const unsubscribe = eventBus.subscribe(
        EVENT_TYPE_SYNC,
        createSyncSubscriber("temp"),
      );
      unsubscribe();
    },
    { time: 500 },
  );

  bench(
    "Subscribe and unsubscribe (batch of 10)",
    () => {
      const eventBus = new EventBus();
      const unsubscribes = [];

      for (let i = 0; i < 10; i++) {
        unsubscribes.push(
          eventBus.subscribe(
            EVENT_TYPE_SYNC,
            createSyncSubscriber(`temp-${i}`),
          ),
        );
      }

      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    },
    { time: 500 },
  );

  bench(
    "Subscribe and unsubscribe (batch of 100)",
    () => {
      const eventBus = new EventBus();
      const unsubscribes = [];

      for (let i = 0; i < 100; i++) {
        unsubscribes.push(
          eventBus.subscribe(
            EVENT_TYPE_SYNC,
            createSyncSubscriber(`temp-${i}`),
          ),
        );
      }

      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    },
    { time: 500 },
  );
});

describe("EventBus Error Handling Performance", () => {
  function createErrorSubscriber(shouldError: boolean) {
    return (type: number, data: any) => {
      if (shouldError) {
        throw new Error("Test error");
      }
      return data.timestampUtcMs;
    };
  }

  function createAsyncErrorSubscriber(shouldError: boolean) {
    return async (type: number, data: any) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (shouldError) {
        throw new Error("Test async error");
      }
      return data.timestampUtcMs;
    };
  }

  // Test error aggregation performance
  const errorEventBus = new EventBus();
  errorEventBus.subscribe(EVENT_TYPE_SYNC, createErrorSubscriber(true));
  errorEventBus.subscribe(EVENT_TYPE_SYNC, createErrorSubscriber(true));
  errorEventBus.subscribe(EVENT_TYPE_SYNC, createErrorSubscriber(false));

  const asyncErrorEventBus = new EventBus();
  asyncErrorEventBus.subscribe(
    EVENT_TYPE_ASYNC,
    createAsyncErrorSubscriber(true),
  );
  asyncErrorEventBus.subscribe(
    EVENT_TYPE_ASYNC,
    createAsyncErrorSubscriber(true),
  );
  asyncErrorEventBus.subscribe(
    EVENT_TYPE_ASYNC,
    createAsyncErrorSubscriber(false),
  );

  bench(
    "Error aggregation (sync)",
    async () => {
      try {
        await errorEventBus.emit(EVENT_TYPE_SYNC, TEST_DATA);
      } catch (error) {
        // Expected error
      }
    },
    { time: 500 },
  );

  bench(
    "Error aggregation (async)",
    async () => {
      try {
        await asyncErrorEventBus.emit(EVENT_TYPE_ASYNC, TEST_DATA);
      } catch (error) {
        // Expected error
      }
    },
    { time: 500 },
  );
});
