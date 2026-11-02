import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GraphqlInspectionTransport,
  ReactorMonitorRegistry,
  type ReactorDescriptor,
} from "../src/index.js";

const DEFAULT_TIMEOUT_MS = 30_000;

/** Accepts every request and never answers; ignores the abort signal. */
function hungRemote(name: string, timeoutMs?: number) {
  let reached!: () => void;
  const requested = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const descriptor: ReactorDescriptor = {
    name,
    kind: "remote",
    remote: {
      url: "http://hung.example/d/powerhouse",
      fetch: () => {
        reached();
        return new Promise<Response>(() => {});
      },
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    },
  };
  return { descriptor, requested };
}

describe("remote inspection request bound", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the fetch and rejects once the timeout passes", async () => {
    let signal: AbortSignal | undefined;
    const transport = new GraphqlInspectionTransport({
      url: "http://hung.example/graphql/inspection",
      timeoutMs: 50,
      fetch: (_url, init) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      },
    });

    await expect(transport.request("ReactorInfo", "{ x }")).rejects.toThrow(
      /ReactorInfo.*timed out after 50ms.*hung\.example/,
    );
    expect(signal?.aborted).toBe(true);
  });

  it("settles a remote provision against a never-answering fetch to failed", async () => {
    vi.useFakeTimers();
    const registry = new ReactorMonitorRegistry();
    const { descriptor } = hungRemote("hung");
    const provisioned = registry.provision(descriptor);
    const outcome = expect(provisioned).rejects.toThrow(/timed out/);

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    await outcome;
    expect(registry.get("hung")?.status).toBe("failed");
  });

  it("bounds a remote provision by the descriptor's timeoutMs", async () => {
    vi.useFakeTimers();
    const registry = new ReactorMonitorRegistry();
    const { descriptor } = hungRemote("hung", 1_234);
    let settled = false;
    const provisioned = registry.provision(descriptor).finally(() => {
      settled = true;
    });
    const outcome = expect(provisioned).rejects.toThrow(
      /timed out after 1234ms/,
    );

    await vi.advanceTimersByTimeAsync(1_233);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
    expect(registry.get("hung")?.status).toBe("failed");
  });

  it("settles a kill of a name whose remote build never answers", async () => {
    vi.useFakeTimers();
    const registry = new ReactorMonitorRegistry();
    const { descriptor, requested } = hungRemote("hung");
    const provisioned = registry.provision(descriptor);
    const outcome = expect(provisioned).rejects.toThrow(/timed out/);
    await requested;
    let killed = false;
    const kill = registry.kill("hung").then(() => {
      killed = true;
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1);
    expect(killed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
    await kill;
    expect(killed).toBe(true);
    expect(registry.get("hung")).toBeUndefined();
  });
});
