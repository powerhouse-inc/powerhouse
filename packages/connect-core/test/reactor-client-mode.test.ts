import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REACTOR_CLIENT_STORAGE_KEY,
  resolveReactorClientMode,
} from "../src/runtime/reactor-client-mode.js";

const config = vi.hoisted(() => ({
  reactorClient: undefined as string | undefined,
}));

vi.mock("../src/runtime/runtime-config.js", () => ({
  getRuntimeConfig: () => ({
    connect: { instance: { reactorClient: config.reactorClient } },
  }),
}));

function tab(search: string, stored: Record<string, string> = {}) {
  vi.stubGlobal("window", {
    location: { search },
    localStorage: {
      getItem: (key: string) => stored[key] ?? null,
      setItem: (key: string, value: string) => {
        stored[key] = value;
      },
    },
  });
  return stored;
}

afterEach(() => {
  vi.unstubAllGlobals();
  config.reactorClient = undefined;
});

describe("resolveReactorClientMode", () => {
  it("reads the served reactorClient", () => {
    tab("");
    config.reactorClient = "remote";
    expect(resolveReactorClientMode()).toBe("remote");
  });

  it("takes a query override over the config, and keeps it for a reload", () => {
    config.reactorClient = "remote";
    const stored = tab("?reactorClient=worker");
    expect(resolveReactorClientMode()).toBe("worker");
    expect(stored[REACTOR_CLIENT_STORAGE_KEY]).toBe("worker");

    tab("", stored);
    expect(resolveReactorClientMode()).toBe("worker");
  });

  it("ignores an unknown mode", () => {
    config.reactorClient = "remote";
    tab("?reactorClient=bogus", { [REACTOR_CLIENT_STORAGE_KEY]: "nope" });
    expect(resolveReactorClientMode()).toBe("remote");
  });
});
