import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  isCountedRequest,
  RequestLoadRecorder,
  type IEventLoopDelaySource,
} from "../../src/http/request-load.js";

describe("isCountedRequest", () => {
  it.each([
    "/graphql",
    "/graphql/r",
    "/graphql/system?x=1",
    "/d/some-drive",
    "/switchboard/graphql",
  ])("counts %s", (url) => {
    expect(isCountedRequest(url)).toBe(true);
  });

  it.each([
    "/graphql/inspection",
    "/graphql/inspection-admin",
    "/base/graphql/inspection?op=x",
    "/health",
    "/ready",
    "/assets/index-abc.js",
    "/favicon.ico",
    "/main.css",
    "/@vite/client",
    "/graphql/stream",
  ])("leaves out %s", (url) => {
    expect(isCountedRequest(url)).toBe(false);
  });

  it("leaves out an event stream", () => {
    expect(isCountedRequest("/graphql", "text/event-stream")).toBe(false);
  });
});

function clock(start = 1_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => (now += ms),
  };
}

describe("RequestLoadRecorder", () => {
  it("reports requests, p95 latency and idle time over its window", () => {
    const time = clock();
    const recorder = new RequestLoadRecorder({ now: time.now });
    for (let i = 1; i <= 20; i++) recorder.record(i * 10);

    expect(recorder.sample()).toEqual({
      requests: 20,
      p95LatencyMs: 190,
      eventLoopDelayMs: 0,
      idleForMs: 0,
    });

    time.advance(5_001);
    expect(recorder.sample()).toEqual({
      requests: 0,
      p95LatencyMs: 0,
      eventLoopDelayMs: 0,
      idleForMs: 5_001,
    });
  });

  it("counts idle time from its start before any request", () => {
    const time = clock();
    const recorder = new RequestLoadRecorder({ now: time.now });
    time.advance(12_000);
    expect(recorder.sample().idleForMs).toBe(12_000);
  });

  it("reports the highest loop-delay p99 read within the window", () => {
    const time = clock();
    const readings = [30, 120, 10];
    const eventLoopDelay: IEventLoopDelaySource = {
      takeP99Ms: () => readings.shift() ?? 0,
      stop: () => {},
    };
    const recorder = new RequestLoadRecorder({ now: time.now, eventLoopDelay });

    expect(recorder.sample().eventLoopDelayMs).toBe(30);
    time.advance(1_000);
    expect(recorder.sample().eventLoopDelayMs).toBe(120);
    time.advance(1_000);
    expect(recorder.sample().eventLoopDelayMs).toBe(120);
    time.advance(5_000);
    expect(recorder.sample().eventLoopDelayMs).toBe(0);
  });

  it("keeps only the window's requests even when nothing samples", () => {
    const time = clock();
    const recorder = new RequestLoadRecorder({ now: time.now });
    for (let i = 0; i < 1_000; i++) {
      recorder.record(5);
      time.advance(100);
    }
    const kept = (recorder as unknown as { completions: unknown[] })
      .completions;
    expect(kept.length).toBeLessThanOrEqual(50);
    expect(recorder.sample().requests).toBe(49);
  });

  describe("attached to a server", () => {
    let server: http.Server | undefined;

    afterEach(async () => {
      await new Promise<void>((resolve) =>
        server ? server.close(() => resolve()) : resolve(),
      );
      server = undefined;
    });

    it("records completed user requests only", async () => {
      server = http.createServer((_req, res) => res.end("ok"));
      const recorder = new RequestLoadRecorder();
      recorder.attach(server);
      await new Promise<void>((resolve) =>
        server!.listen(0, "127.0.0.1", resolve),
      );
      const { port } = server.address() as AddressInfo;
      const get = async (path: string) => {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        await response.text();
      };

      await get("/graphql");
      await get("/graphql/inspection");
      await get("/health");
      await get("/graphql/r");

      await expect.poll(() => recorder.sample().requests).toBe(2);

      recorder.stop();
      await get("/graphql");
      expect(recorder.sample().requests).toBe(2);
    });

    it("records a request the client aborts", async () => {
      let received!: () => void;
      const arrived = new Promise<void>((resolve) => (received = resolve));
      // Never answers: only the client going away ends the request.
      server = http.createServer(() => received());
      const recorder = new RequestLoadRecorder();
      recorder.attach(server);
      await new Promise<void>((resolve) =>
        server!.listen(0, "127.0.0.1", resolve),
      );
      const { port } = server.address() as AddressInfo;
      const controller = new AbortController();
      const request = fetch(`http://127.0.0.1:${port}/graphql`, {
        signal: controller.signal,
      }).catch(() => undefined);

      await arrived;
      controller.abort();
      await request;

      await expect.poll(() => recorder.sample().requests).toBe(1);
      server.closeAllConnections();
    });

    it("records a finished request once", async () => {
      server = http.createServer((_req, res) => res.end("ok"));
      const recorder = new RequestLoadRecorder();
      recorder.attach(server);
      await new Promise<void>((resolve) =>
        server!.listen(0, "127.0.0.1", resolve),
      );
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/graphql`);
      await response.text();
      server.closeAllConnections();

      await expect.poll(() => recorder.sample().requests).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(recorder.sample().requests).toBe(1);
    });
  });
});
