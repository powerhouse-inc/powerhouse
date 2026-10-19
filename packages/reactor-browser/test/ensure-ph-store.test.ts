import { describe, expect, it } from "vitest";
import {
  ensurePHStore,
  getActivePHStore,
  subscribePHStore,
} from "../src/hooks/ph-store.js";

// Its own file: the module must not have bound a store yet.
describe("ensurePHStore", () => {
  it("binds a real store, taking over a plain window.ph", () => {
    expect(getActivePHStore()).toBeUndefined();
    window.ph = { basePath: "/plain/" };
    const store = ensurePHStore();
    expect(window.ph).toBe(store);
    expect(getActivePHStore()).toBe(store);
    expect(store.basePath).toBe("/plain/");

    let calls = 0;
    subscribePHStore(store, () => calls++, "loading");
    store.loading = true;
    expect(calls).toBe(1);
    expect(ensurePHStore()).toBe(store);
  });
});
