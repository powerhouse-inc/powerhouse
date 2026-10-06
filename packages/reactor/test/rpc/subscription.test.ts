import { describe, expect, it, vi } from "vitest";
import type { MessageRouter } from "../../src/rpc/message-router.js";
import type { ClientMessage, OwnerMessage } from "../../src/rpc/protocol.js";
import {
  SubscriptionStore,
  createCorrelatedSubscriptions,
} from "../../src/rpc/subscription.js";

describe("SubscriptionStore", () => {
  it("end() invokes and removes; a second end() is a no-op", () => {
    const store = new SubscriptionStore();
    const unsub = vi.fn();
    store.set("a", unsub);
    store.end("a");
    store.end("a");
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it("delete() removes without invoking", () => {
    const store = new SubscriptionStore();
    const unsub = vi.fn();
    store.set("a", unsub);
    store.delete("a");
    store.end("a");
    expect(unsub).not.toHaveBeenCalled();
  });

  it("drain() invokes all and clears", () => {
    const store = new SubscriptionStore();
    const a = vi.fn();
    const b = vi.fn();
    store.set("a", a);
    store.set("b", b);
    store.drain();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    store.end("a");
    expect(a).toHaveBeenCalledTimes(1);
  });
});

describe("createCorrelatedSubscriptions", () => {
  function fakeRouter() {
    const handlers = new Map<string, (msg: OwnerMessage) => void>();
    const posts: ClientMessage[] = [];
    const router = {
      on: (kind: string, h: (msg: OwnerMessage) => void) => {
        handlers.set(kind, h);
        return () => handlers.delete(kind);
      },
      post: (m: ClientMessage) => posts.push(m),
    } as unknown as MessageRouter;
    const deliver = (msg: OwnerMessage) => handlers.get(msg.k)?.(msg);
    return { router, posts, deliver };
  }

  it("mints ids, posts open/close, and routes events to the right sub", () => {
    const { router, posts, deliver } = fakeRouter();
    const seen: unknown[] = [];
    const subs = createCorrelatedSubscriptions<
      (c: unknown) => void,
      "event",
      "sub-err"
    >(router, {
      idPrefix: "t",
      eventKind: "event",
      errKind: "sub-err",
      onEvent: (sub, msg) => sub(msg.change),
      onError: () => {},
      close: (id) => ({ k: "unsub", id }),
    });

    const unsub = subs.subscribe(
      (c) => seen.push(c),
      (id) => ({ k: "sub", id, search: "q" }),
    );
    expect(posts).toContainEqual({ k: "sub", id: "t1", search: "q" });

    deliver({ k: "event", id: "t1", change: "c1" });
    expect(seen).toEqual(["c1"]);

    unsub();
    expect(posts).toContainEqual({ k: "unsub", id: "t1" });
    deliver({ k: "event", id: "t1", change: "c2" });
    expect(seen).toEqual(["c1"]);
  });

  it("error is terminal: drops the sub and forwards the error once", () => {
    const { router, deliver } = fakeRouter();
    const errs: unknown[] = [];
    const seen: unknown[] = [];
    const subs = createCorrelatedSubscriptions<
      (c: unknown) => void,
      "event",
      "sub-err"
    >(router, {
      idPrefix: "t",
      eventKind: "event",
      errKind: "sub-err",
      onEvent: (sub, msg) => sub(msg.change),
      onError: (_sub, msg) => errs.push(msg.error),
      close: (id) => ({ k: "unsub", id }),
    });

    subs.subscribe(
      (c) => seen.push(c),
      (id) => ({ k: "sub", id, search: "q" }),
    );
    deliver({
      k: "sub-err",
      id: "t1",
      error: { name: "E", message: "boom" },
    });
    deliver({ k: "event", id: "t1", change: "late" });

    expect(errs).toEqual([{ name: "E", message: "boom" }]);
    expect(seen).toEqual([]);
  });

  it("gives independent subscriptions distinct ids", () => {
    const { router, posts } = fakeRouter();
    const subs = createCorrelatedSubscriptions<
      (c: unknown) => void,
      "event",
      "sub-err"
    >(router, {
      idPrefix: "t",
      eventKind: "event",
      errKind: "sub-err",
      onEvent: (sub, msg) => sub(msg.change),
      onError: () => {},
      close: (id) => ({ k: "unsub", id }),
    });
    subs.subscribe(
      () => {},
      (id) => ({ k: "sub", id, search: "a" }),
    );
    subs.subscribe(
      () => {},
      (id) => ({ k: "sub", id, search: "b" }),
    );
    expect(posts.map((p) => (p as { id?: string }).id)).toEqual(["t1", "t2"]);
  });
});
