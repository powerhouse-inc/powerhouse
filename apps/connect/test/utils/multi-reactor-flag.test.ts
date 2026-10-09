import { afterEach, describe, expect, it, vi } from "vitest";
import { isMultiReactorEnabled } from "../../src/utils/multi-reactor-flag.js";

const config = vi.hoisted(() => ({
  multiReactor: false as boolean | undefined,
}));

vi.mock("../../src/runtime-config.js", () => ({
  getRuntimeConfig: () => ({
    connect: { instance: { multiReactor: config.multiReactor } },
  }),
}));

function tab(search: string, stored: Record<string, string>) {
  vi.stubGlobal("window", {
    location: { search },
    localStorage: {
      getItem: (key: string) => stored[key] ?? null,
      setItem: vi.fn(),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isMultiReactorEnabled", () => {
  it("reads the runtime config", () => {
    tab("", {});
    config.multiReactor = true;
    expect(isMultiReactorEnabled()).toBe(true);
    config.multiReactor = false;
    expect(isMultiReactorEnabled()).toBe(false);
    config.multiReactor = undefined;
    expect(isMultiReactorEnabled()).toBe(false);
  });

  it("takes no per-tab override, since the flag is in the worker fingerprint", () => {
    config.multiReactor = false;
    tab("?multiReactor=1", { "ph:multiReactor": "true" });
    expect(isMultiReactorEnabled()).toBe(false);

    config.multiReactor = true;
    tab("?multiReactor=0", { "ph:multiReactor": "false" });
    expect(isMultiReactorEnabled()).toBe(true);
  });
});
