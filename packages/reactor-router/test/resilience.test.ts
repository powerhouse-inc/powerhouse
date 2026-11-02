import { describe, expect, it } from "vitest";
import { RouteDispatcher } from "../src/dispatcher.js";
import { RoutingReactorClient } from "../src/routing-client.js";
import { FakeBackend, fakeDocument, REMOTE, silent } from "./stubs.js";

describe("probe deadline", () => {
  it("creates locally within the probe timeout while a remote never answers", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    remote.hanging.add("isServed");
    const client = new RoutingReactorClient([local.config(), remote.config()], {
      primaryBackend: "local",
      collections: { "new-doc": "local" },
      probeTimeoutMs: 100,
      onDiagnostic: silent,
    });

    const started = Date.now();
    await client.write.create(fakeDocument({ id: "new-doc" }));

    expect(Date.now() - started).toBeLessThan(100 + 500);
    expect(local.documents.has("new-doc")).toBe(true);
    expect(remote.called("isServed")).toBe(true);
  });

  it("answers unknown at the deadline and says so", async () => {
    const remote = new FakeBackend("remote", undefined, REMOTE);
    remote.hanging.add("isServed");
    const reported: string[] = [];
    const dispatcher = new RouteDispatcher([remote.handle()], {
      probeTimeoutMs: 20,
      onDiagnostic: (message) => reported.push(message),
    });

    await expect(dispatcher.owns(dispatcher.backends[0], "doc")).resolves.toBe(
      "unknown",
    );
    expect(reported.join("\n")).toMatch(/remote.*did not answer within 20 ms/);
  });

  it("passes the probe a signal that aborts at the deadline", async () => {
    let seen: AbortSignal | undefined;
    const remote = new FakeBackend("remote", undefined, REMOTE);
    const api = remote.api();
    const dispatcher = new RouteDispatcher(
      [
        remote.handle({
          backend: {
            ...api,
            isServed: (_identifier, _view, signal) => {
              seen = signal;
              return new Promise<boolean>(() => {});
            },
          },
        }),
      ],
      { probeTimeoutMs: 20, onDiagnostic: silent },
    );

    await dispatcher.owns(dispatcher.backends[0], "doc");

    expect(seen?.aborted).toBe(true);
  });
});

describe("backend health", () => {
  it("answers unknown for a backend that reports down, without probing it", async () => {
    const remote = new FakeBackend("remote", undefined, REMOTE);
    remote.health = "down";
    remote.seed(fakeDocument({ id: "doc" }));
    const dispatcher = new RouteDispatcher([remote.handle()], {
      onDiagnostic: silent,
    });

    await expect(dispatcher.owns(dispatcher.backends[0], "doc")).resolves.toBe(
      "unknown",
    );
    expect(remote.called("isServed")).toBe(false);
  });

  it("probes a backend that reports up", async () => {
    const remote = new FakeBackend("remote", undefined, REMOTE);
    remote.health = "up";
    remote.seed(fakeDocument({ id: "doc" }));
    const dispatcher = new RouteDispatcher([remote.handle()], {
      onDiagnostic: silent,
    });

    await expect(dispatcher.owns(dispatcher.backends[0], "doc")).resolves.toBe(
      "yes",
    );
  });

  it("is reported by describeRouting for backends that declare it", () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    remote.health = "down";
    const client = new RoutingReactorClient([local.config(), remote.config()], {
      onDiagnostic: silent,
    });

    expect(client.describeRouting().health).toEqual([
      { backend: "remote", health: "down" },
    ]);
    remote.health = "up";
    expect(client.describeRouting().health).toEqual([
      { backend: "remote", health: "up" },
    ]);
  });
});
