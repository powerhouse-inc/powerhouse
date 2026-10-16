import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { PropsWithChildren } from "react";
import { act, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { browserNavigation, setSearchParams } from "../src/hooks/navigation.js";
import {
  createPHStore,
  ensurePHStore,
  PHStoreProvider,
} from "../src/hooks/ph-store.js";
import { isPlainClick, useLinkProps } from "../src/hooks/link-props.js";
// The package entry loads it: it selects what the browser fallback opens.
import "../src/hooks/sync-selection.js";
import { useSearchParams, useSetSearchParams } from "../src/hooks/url-state.js";
import type { PHNavigation, SetSearchParams } from "../src/types/global.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const START = window.location.pathname;

function useUrlState() {
  return { params: useSearchParams(), set: useSetSearchParams() };
}

afterEach(() => {
  ensurePHStore().navigation = undefined;
  window.history.replaceState(null, "", START);
});

describe("URL state hooks without a host navigation", () => {
  it("read and write the query string through the browser history", async () => {
    window.history.replaceState(null, "", `${START}?theme=dark#legacy`);
    const { result } = await renderHook(() => useUrlState());
    expect(result.current.params).toEqual({ theme: "dark" });

    const length = window.history.length;
    act(() => result.current.set({ item: "a" }));
    expect(result.current.params).toEqual({ theme: "dark", item: "a" });
    expect(window.location.search).toBe("?theme=dark&item=a");
    expect(window.location.hash).toBe("");
    expect(window.history.length).toBe(length + 1);

    act(() => result.current.set({ item: "b" }, { replace: true }));
    expect(result.current.params.item).toBe("b");
    expect(window.history.length).toBe(length + 1);

    // A function returns every param; an undefined value removes one.
    act(() => result.current.set((prev) => ({ ...prev, theme: undefined })));
    expect(result.current.params).toEqual({ item: "b" });
    expect(window.location.search).toBe("?item=b");
  });

  it("follows back and forward", async () => {
    const { result } = await renderHook(() => useUrlState());
    act(() => result.current.set({ item: "a" }));
    act(() => result.current.set({ item: "b" }));

    const popped = new Promise((resolve) =>
      window.addEventListener("popstate", resolve, { once: true }),
    );
    window.history.back();
    await act(() => popped);
    expect(result.current.params).toEqual({ item: "a" });
  });

  it("writes outside React through the app store's navigation", () => {
    const setSearch = vi.fn();
    ensurePHStore().navigation = {
      ...browserNavigation,
      location: () => ({ pathname: START, search: "?theme=dark" }),
      setSearch,
    };
    setSearchParams({ item: "a" }, { replace: true });

    expect(setSearch).toHaveBeenCalledWith(expect.any(Function), {
      replace: true,
    });
    const update = setSearch.mock.calls[0][0] as (
      prev: Record<string, string>,
    ) => Record<string, string>;
    expect(update({ theme: "dark" })).toEqual({ theme: "dark", item: "a" });
  });
});

describe("URL state hooks with a store-provided navigation", () => {
  // A host keeping the params in its own store instead of the URL.
  function createMemoryNavigation(initial: Record<string, string>) {
    let params = initial;
    const listeners = new Set<() => void>();
    const subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const set: SetSearchParams = (update) => {
      const next =
        typeof update === "function"
          ? update(params)
          : { ...params, ...update };
      params = Object.fromEntries(
        Object.entries(next).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      );
      for (const listener of listeners) listener();
    };
    const navigation: PHNavigation = {
      ...browserNavigation,
      useSearchParams: () => useSyncExternalStore(subscribe, () => params),
      useSetSearchParams: () => set,
    };
    return navigation;
  }

  it("delegate to the nearest store's navigation", async () => {
    // The bound store's navigation loses to the one in context.
    ensurePHStore().navigation = createMemoryNavigation({ global: "1" });
    const store = createPHStore({
      navigation: createMemoryNavigation({ a: "1" }),
    });
    const { result } = await renderHook(() => useUrlState(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <PHStoreProvider store={store}>{children}</PHStoreProvider>
      ),
    });
    expect(result.current.params).toEqual({ a: "1" });

    act(() => result.current.set({ b: "2" }));
    expect(result.current.params).toEqual({ a: "1", b: "2" });
    act(() => result.current.set(() => ({ c: "3" })));
    expect(result.current.params).toEqual({ c: "3" });
    // The browser URL is the host's business.
    expect(window.location.search).toBe("");
  });

  it("fall back to the bound store's navigation", async () => {
    ensurePHStore().navigation = createMemoryNavigation({ global: "1" });
    const { result } = await renderHook(() => useUrlState());
    expect(result.current.params).toEqual({ global: "1" });
  });
});

describe("closing a document without a host navigation", () => {
  const popped = () =>
    new Promise((resolve) =>
      window.addEventListener("popstate", resolve, { once: true }),
    );

  it("returns past the document's own entries, keeping it forward", async () => {
    window.history.replaceState(null, "", "/d/docs/folder-1");
    browserNavigation.open({ driveSlug: "docs", nodeSlug: "spec-1" });
    browserNavigation.setSearch((prev) => ({ ...prev, step: "a" }));
    browserNavigation.setSearch((prev) => ({ ...prev, step: "b" }));
    expect(window.location.search).toBe("?step=b");

    const back = popped();
    expect(browserNavigation.closeOpened?.()).toBe(true);
    await back;
    expect(window.location.pathname).toBe("/d/docs/folder-1");

    const forward = popped();
    window.history.forward();
    await forward;
    expect(window.location.pathname).toBe("/d/docs/spec-1");
  });

  it("does not close a document this session did not open", () => {
    window.history.replaceState(null, "", "/d/docs/spec-1?step=a");
    expect(browserNavigation.closeOpened?.()).toBe(false);
    expect(window.location.pathname).toBe("/d/docs/spec-1");
  });
});

describe("link props without a host navigation", () => {
  it("link under the base path with the current params", async () => {
    window.history.replaceState(null, "", `${START}?theme=dark`);
    const store = ensurePHStore();
    store.basePath = "/connect/";
    try {
      const { result } = await renderHook(() =>
        useLinkProps({ driveSlug: "docs", nodeSlug: "spec-1" }),
      );
      expect(result.current.href).toBe("/connect/d/docs/spec-1?theme=dark");
    } finally {
      store.basePath = undefined;
    }
  });

  it("mark only the link to the current location as current", async () => {
    window.history.replaceState(null, "", "/d/docs/spec-1?theme=dark");
    const { result } = await renderHook(() => ({
      node: useLinkProps({ driveSlug: "docs", nodeSlug: "spec-1" }),
      drive: useLinkProps({ driveSlug: "docs" }),
    }));
    expect(result.current.node["aria-current"]).toBe("page");
    expect(result.current.drive["aria-current"]).toBeUndefined();

    act(() => {
      window.history.pushState(null, "", "/d/docs");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.node["aria-current"]).toBeUndefined();
    expect(result.current.drive["aria-current"]).toBe("page");
  });

  it("leave modified and other-button clicks to the browser", () => {
    const click = (init: Partial<MouseEvent>) =>
      isPlainClick({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        defaultPrevented: false,
        preventDefault: () => {},
        ...init,
      });
    expect(click({})).toBe(true);
    for (const init of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
      { defaultPrevented: true },
    ]) {
      expect(click(init)).toBe(false);
    }
  });

  it("select what a plain click opens", async () => {
    window.history.replaceState(null, "", "/d/docs");
    const store = ensurePHStore();
    const nodeId = "11111111-2222-4333-8444-555555555555";
    store.drives = [
      { header: { id: "drive-1", slug: "docs" } } as DocumentDriveDocument,
    ];
    try {
      const { result } = await renderHook(() =>
        useLinkProps({ driveSlug: "docs", nodeSlug: `spec-${nodeId}` }),
      );
      act(() =>
        result.current.onClick({
          button: 0,
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          defaultPrevented: false,
          preventDefault: () => {},
        }),
      );
      expect(window.location.pathname).toBe(`/d/docs/spec-${nodeId}`);
      expect(store.selectedDriveId).toBe("drive-1");
      expect(store.selectedNodeId).toBe(nodeId);
    } finally {
      store.drives = undefined;
      store.selectedDriveId = undefined;
      store.selectedNodeId = undefined;
    }
  });
});
