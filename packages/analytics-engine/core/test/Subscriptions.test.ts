import { it, expect } from "vitest";
import { AnalyticsPath } from "../src/AnalyticsPath.js";
import {
  AnalyticsSubscriptionManager,
  NotificationError,
} from "../src/AnalyticsSubscriptionManager.js";

it("it should allow subscribing to a source with an explicit match", () => {
  const subscriptions = new AnalyticsSubscriptionManager();

  let called = 0;
  const unsubscribe = subscriptions.subscribeToPath(
    AnalyticsPath.fromString("/a"),
    (source) => {
      called++;
    },
  );

  expect(unsubscribe).toBeDefined();
  expect(called).toBe(0);

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a")]);

  expect(called).toBe(1);
});

it("all subscriptions should be notified of a path update", () => {
  const subscriptions = new AnalyticsSubscriptionManager();

  let called = 0;
  subscriptions.subscribeToPath(AnalyticsPath.fromString("/a"), () => {
    called++;
  });

  subscriptions.subscribeToPath(AnalyticsPath.fromString("/a"), () => {
    called++;
  });

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a")]);

  expect(called).toBe(2);
});

it("all subscriptions should be guaranteed to be notified, even if a subscriber throws an error", () => {
  const subscriptions = new AnalyticsSubscriptionManager();

  let called = 0;
  subscriptions.subscribeToPath(AnalyticsPath.fromString("/a"), () => {
    called++;
    throw new Error("test");
  });

  subscriptions.subscribeToPath(AnalyticsPath.fromString("/a"), () => {
    called++;
  });

  // notify throws, but only after all subscribers have been notified
  try {
    subscriptions.notifySubscribers([AnalyticsPath.fromString("/a")]);
  } catch (e) {
    expect(e).toBeInstanceOf(NotificationError);
    expect((e as NotificationError).innerErrors.length).toBe(1);
    expect((e as NotificationError).innerErrors[0].message).toBe("test");
  }

  expect(called).toBe(2);
});

it("it should ignore trailing slashes in both subscription and notification paths", () => {
  const subscriptions = new AnalyticsSubscriptionManager();

  // Test that a subscription to /a/ matches /a
  let aCalled = 0;
  subscriptions.subscribeToPath(AnalyticsPath.fromString("/a/"), (source) => {
    aCalled++;
  });

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a")]);

  expect(aCalled).toBe(1);

  // Test that a subscription to /b matches /b/
  let bCalled = 0;
  subscriptions.subscribeToPath(AnalyticsPath.fromString("/b"), (source) => {
    bCalled++;
  });

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/b/")]);

  expect(bCalled).toBe(1);
});

it("unsubscribing should remove the subscription", () => {
  const subscriptions = new AnalyticsSubscriptionManager();

  let called = 0;
  const unsubscribe = subscriptions.subscribeToPath(
    AnalyticsPath.fromString("/a"),
    () => {
      called++;
    },
  );

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a")]);

  expect(called).toBe(1);

  unsubscribe();

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a")]);

  expect(called).toBe(1);
});

it("unsubscribing should remove only the relevant subscription", () => {
  const subscriptions = new AnalyticsSubscriptionManager();

  let firstCalled = 0;
  let secondCalled = 0;

  const firstUnsub = subscriptions.subscribeToPath(
    AnalyticsPath.fromString("/a"),
    () => {
      firstCalled++;
    },
  );

  subscriptions.subscribeToPath(AnalyticsPath.fromString("/a"), () => {
    secondCalled++;
  });

  firstUnsub();

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a")]);

  expect(firstCalled).toBe(0);
  expect(secondCalled).toBe(1);
});

it("notifying a child path should notify parent paths", () => {
  const subscriptions = new AnalyticsSubscriptionManager();

  let called = 0;
  subscriptions.subscribeToPath(AnalyticsPath.fromString("/a/b"), () => {
    called++;
  });

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a/b/c/d")]);

  expect(called).toBe(1);

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a/b/c")]);

  expect(called).toBe(2);

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a/b")]);

  expect(called).toBe(3);
});

it("notifying a parent path should not notify child paths", () => {
  const subscriptions = new AnalyticsSubscriptionManager();

  let called = 0;
  subscriptions.subscribeToPath(AnalyticsPath.fromString("/a/b/c"), () => {
    called++;
  });

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a/b")]);

  expect(called).toBe(0);
});

it("subscriptions support wildcards", () => {
  const subscriptions = new AnalyticsSubscriptionManager();

  // Test subscription with wildcard segment
  let wildcardCalls = 0;
  const wildcardPath = AnalyticsPath.fromString("/a/*/c");
  subscriptions.subscribeToPath(wildcardPath, (source) => {
    wildcardCalls++;
  });

  // This should match the wildcard pattern
  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a/b/c")]);
  expect(wildcardCalls).toBe(1);

  // This should also match
  subscriptions.notifySubscribers([
    AnalyticsPath.fromString("/a/something-else/c"),
  ]);
  expect(wildcardCalls).toBe(2);

  // This should not match (different first segment)
  subscriptions.notifySubscribers([AnalyticsPath.fromString("/different/b/c")]);
  expect(wildcardCalls).toBe(2);

  // This should not match (different last segment)
  subscriptions.notifySubscribers([AnalyticsPath.fromString("/a/b/different")]);
  expect(wildcardCalls).toBe(2);

  // Test wildcard at the end - should match any child path
  let endWildcardCalls = 0;
  subscriptions.subscribeToPath(
    AnalyticsPath.fromString("/x/y/*"),
    (source) => {
      endWildcardCalls++;
    },
  );

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/x/y/z")]);
  expect(endWildcardCalls).toBe(1);

  subscriptions.notifySubscribers([AnalyticsPath.fromString("/x/y/anything")]);
  expect(endWildcardCalls).toBe(2);

  // This should also match, as it's a child of the wildcard
  subscriptions.notifySubscribers([
    AnalyticsPath.fromString("/x/y/anything/again"),
  ]);
  expect(endWildcardCalls).toBe(3);
});
