import type { ReactNode } from "react";
import { act } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import {
  addLoadingEventHandler,
  setLoading,
  useLoading,
} from "../src/hooks/loading.js";
import { subscribeToPHValue } from "../src/hooks/make-ph-event-functions.js";
import {
  bindPHStoreToWindow,
  createPHStore,
  getActivePHStore,
  getPHStore,
  PHStoreProvider,
  subscribePHStore,
} from "../src/hooks/ph-store.js";

describe("PHStore", () => {
  it("notifies subscribers when a key is assigned a new value", () => {
    const store = createPHStore({ loading: true });
    let calls = 0;
    const unsubscribe = subscribePHStore(store, () => calls++);

    store.loading = true;
    expect(calls).toBe(0);
    store.loading = false;
    store.basePath = "/connect/";
    expect(calls).toBe(2);
    expect({ ...store }).toEqual({ loading: false, basePath: "/connect/" });

    unsubscribe();
    store.loading = true;
    expect(calls).toBe(2);
  });

  it("notifies a key's subscribers only for that key", () => {
    const store = createPHStore();
    let loadingCalls = 0;
    subscribePHStore(store, () => loadingCalls++, "loading");
    store.basePath = "/";
    expect(loadingCalls).toBe(0);
    store.loading = true;
    expect(loadingCalls).toBe(1);
  });
});

describe("PHStore bound to window.ph", () => {
  const store = createPHStore();

  beforeAll(() => {
    window.ph = { loading: true };
    bindPHStoreToWindow(store);
    addLoadingEventHandler();
  });

  it("becomes window.ph, keeping values set before binding", () => {
    expect(getActivePHStore()).toBe(store);
    expect(getPHStore()).toBe(store);
    expect(window.ph).toBe(store);
    expect(store.loading).toBe(true);
  });

  it("updates hooks under the provider when set through the PH setters", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PHStoreProvider store={store}>{children}</PHStoreProvider>
    );
    const { result } = await renderHook(() => useLoading(), { wrapper });
    expect(result.current).toBe(true);

    act(() => setLoading(false));
    expect(store.loading).toBe(false);
    expect(result.current).toBe(false);

    act(() => {
      store.loading = true;
    });
    expect(result.current).toBe(true);
  });

  it("notifies the store and window listeners once per set, even on re-set", () => {
    const windowEvents: string[] = [];
    const onWindowEvent = (event: Event) => windowEvents.push(event.type);
    window.addEventListener("ph:loadingUpdated", onWindowEvent);
    let calls = 0;
    const unsubscribe = subscribeToPHValue("loading", () => calls++);

    setLoading(true);
    setLoading(true);
    expect(calls).toBe(2);
    expect(windowEvents).toEqual(["ph:loadingUpdated", "ph:loadingUpdated"]);

    unsubscribe();
    window.removeEventListener("ph:loadingUpdated", onWindowEvent);
  });

  it("fires ph:<key>Updated once for a store write and a ph:set* event", () => {
    const seen: unknown[] = [];
    const onUpdated = () => seen.push(window.ph?.loading);
    window.addEventListener("ph:loadingUpdated", onUpdated);

    store.loading = false;
    window.dispatchEvent(
      new CustomEvent("ph:setLoading", { detail: { loading: true } }),
    );

    expect(seen).toEqual([false, true]);
    window.removeEventListener("ph:loadingUpdated", onUpdated);
  });

  it("keeps hooks without a provider in sync through the PH setters", async () => {
    const { result } = await renderHook(() => useLoading());
    act(() => setLoading(false));
    expect(result.current).toBe(false);
    expect(store.loading).toBe(false);
  });
});

describe("binding a new PHStore to window.ph", () => {
  it("keeps the new store's values over a plain window.ph", () => {
    window.ph = { loading: true, basePath: "/old/" };
    const store = createPHStore({ basePath: "/new/" });
    bindPHStoreToWindow(store);
    expect(store.basePath).toBe("/new/");
    expect(store.loading).toBe(true);
  });

  it("replaces a previously bound store without taking its values", () => {
    bindPHStoreToWindow(createPHStore({ basePath: "/connect/" }));
    const store = createPHStore();
    bindPHStoreToWindow(store);
    expect(window.ph).toBe(store);
    expect(store.basePath).toBeUndefined();
  });
});
