import { API_ERROR, errorUtils } from "@verdaccio/core";
import { describe, expect, it } from "vitest";
import {
  wrapGetRemoteMetadata,
  type ProxyStorageLike,
} from "../src/uplink-miss-cache.js";

// Stand-in uplink that knows only `known` and counts every request
class FakeUplink implements ProxyStorageLike {
  maxage = 60_000;
  calls: string[] = [];
  getRemoteMetadata(name: string, _options?: unknown) {
    this.calls.push(name);
    if (name === "known") return Promise.resolve([{ name }, "etag"]);
    return Promise.reject(errorUtils.getNotFound(API_ERROR.NOT_PACKAGE_UPLINK));
  }
}

describe("uplink miss cache", () => {
  wrapGetRemoteMetadata(FakeUplink.prototype, 2);

  it("never caches a hit", async () => {
    const up = new FakeUplink();
    await up.getRemoteMetadata("known", {});
    await up.getRemoteMetadata("known", {});
    expect(up.calls).toEqual(["known", "known"]);
  });

  it("evicts the least recently asked name past the limit", async () => {
    const up = new FakeUplink();
    const ask = (name: string) =>
      up.getRemoteMetadata(name, {}).catch(() => undefined);
    await ask("a");
    await ask("b");
    await ask("a");
    await ask("c");
    up.calls = [];
    await ask("a");
    await ask("c");
    await ask("b");
    expect(up.calls).toEqual(["b"]);
  });

  it("keeps a separate cache per uplink", async () => {
    const one = new FakeUplink();
    const two = new FakeUplink();
    await one.getRemoteMetadata("x", {}).catch(() => undefined);
    await two.getRemoteMetadata("x", {}).catch(() => undefined);
    expect([one.calls, two.calls]).toEqual([["x"], ["x"]]);
  });
});
