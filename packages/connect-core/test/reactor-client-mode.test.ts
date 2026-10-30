import { logger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  newDrivesBlocked,
  REACTOR_CLIENT_STORAGE_KEY,
  resolveReactorClientMode,
} from "../src/runtime/reactor-client-mode.js";

const config = vi.hoisted(() => ({
  reactorClient: undefined as string | undefined,
  newDrives: undefined as string | undefined,
}));

vi.mock("../src/runtime/runtime-config.js", () => ({
  getRuntimeConfig: () => ({
    connect: {
      instance: {
        reactorClient: config.reactorClient,
        router: config.newDrives ? { newDrives: config.newDrives } : undefined,
      },
    },
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
      removeItem: (key: string) => {
        delete stored[key];
      },
    },
  });
  return stored;
}

afterEach(() => {
  vi.unstubAllGlobals();
  config.reactorClient = undefined;
  config.newDrives = undefined;
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

  it("drops a stored local-only override when new drives go to a switchboard", () => {
    config.reactorClient = "router";
    config.newDrives = "sb";
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const stored = tab("", { [REACTOR_CLIENT_STORAGE_KEY]: "in-process" });

    expect(resolveReactorClientMode()).toBe("router");
    expect(stored).not.toHaveProperty(REACTOR_CLIENT_STORAGE_KEY);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Ignoring the stored ?reactorClient"),
      "in-process",
      "sb",
    );
    expect(newDrivesBlocked()).toBeUndefined();
    warn.mockRestore();
  });

  it("keeps a stored remote override when new drives go to a switchboard", () => {
    config.reactorClient = "router";
    config.newDrives = "sb";
    tab("", { [REACTOR_CLIENT_STORAGE_KEY]: "remote" });
    expect(resolveReactorClientMode()).toBe("remote");
    expect(newDrivesBlocked()).toBeUndefined();
  });

  it("applies a local-only override from the URL for this load only, and blocks new drives", () => {
    config.reactorClient = "router";
    config.newDrives = "sb";
    const stored = tab("?reactorClient=in-process");

    expect(resolveReactorClientMode()).toBe("in-process");
    expect(stored).not.toHaveProperty(REACTOR_CLIENT_STORAGE_KEY);
    expect(newDrivesBlocked()?.message).toBe(
      "New drives go to sb, but this browser is set to keep its reactor to itself (?reactorClient=in-process).",
    );

    tab("", stored);
    expect(resolveReactorClientMode()).toBe("router");
    expect(newDrivesBlocked()).toBeUndefined();
  });
});
