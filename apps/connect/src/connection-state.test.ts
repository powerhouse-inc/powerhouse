import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ConnectionStateModule from "./connection-state.js";

let state: typeof ConnectionStateModule;

beforeEach(async () => {
  vi.resetModules();
  state = await import("./connection-state.js");
});

describe("storage-held connection status", () => {
  it("is not cleared by a live worker's pong", () => {
    state.setWorkerConnectionStatus("storage-held");
    state.setWorkerConnectionStatus("connected");
    expect(state.getWorkerConnectionStatus()).toBe("storage-held");
  });

  it("clears once the worker owns the stores", () => {
    state.setWorkerConnectionStatus("storage-held");
    state.clearStorageHeld();
    expect(state.getWorkerConnectionStatus()).toBe("connected");
  });

  it("leaves a worse status in place when cleared", () => {
    state.setWorkerConnectionStatus("storage-held");
    state.setWorkerConnectionStatus("lost");
    state.clearStorageHeld();
    expect(state.getWorkerConnectionStatus()).toBe("lost");
  });
});
