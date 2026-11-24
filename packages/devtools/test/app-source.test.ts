// @vitest-environment happy-dom
import type { PHGlobal } from "@powerhousedao/reactor-browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { powerhouseAppSource } from "../src/app-source.js";

type Manager = NonNullable<PHGlobal["vetraPackageManager"]>;

const editor = (id: string, documentTypes: string[]) => ({
  config: { id },
  documentTypes,
});

/** A package manager with one package of `editors`, which `load` replaces. */
function managerWith(editors: ReturnType<typeof editor>[]) {
  const listeners = new Set<() => void>();
  const manager = {
    packages: [{ editors }],
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    manager: manager as unknown as Manager,
    listening: () => listeners.size,
    load: (next: ReturnType<typeof editor>[]) => {
      manager.packages = [{ editors: next }];
      for (const listener of listeners) listener();
    },
  };
}

/** Sets a key as a store bound to the window does: the value, then the event. */
function setOnPage<K extends keyof PHGlobal>(key: K, value: PHGlobal[K]) {
  (window.ph ??= {})[key] = value;
  window.dispatchEvent(new CustomEvent(`ph:${key}Updated`));
}

afterEach(() => {
  delete window.ph;
});

describe("what a Powerhouse page tells DevTools", () => {
  it("is nothing on a page without window.ph", () => {
    expect(powerhouseAppSource().read()).toEqual({});
  });

  it("answers the same object until the page changes", () => {
    const source = powerhouseAppSource();
    const stop = source.subscribe(() => undefined);
    const first = source.read();
    expect(source.read()).toBe(first);

    setOnPage("toast", vi.fn());
    expect(source.read()).not.toBe(first);
    stop();
  });

  it("names the loaded editors and drive apps, and follows the packages the app loads", () => {
    const { manager, load } = managerWith([
      editor("invoice-editor", ["acme/invoice"]),
      editor("billing", ["powerhouse/document-drive"]),
    ]);
    const source = powerhouseAppSource();
    const onChange = vi.fn();
    const stop = source.subscribe(onChange);

    setOnPage("vetraPackageManager", manager);
    expect(source.read().loadedModules).toEqual({
      editors: ["invoice-editor"],
      apps: ["billing"],
    });

    onChange.mockClear();
    load([editor("todo-editor", ["acme/todo"])]);
    expect(onChange).toHaveBeenCalledOnce();
    expect(source.read().loadedModules).toEqual({
      editors: ["todo-editor"],
      apps: [],
    });
    stop();
  });

  it("stops listening to the app when DevTools stops listening to it", () => {
    const { manager, listening } = managerWith([]);
    window.ph = { vetraPackageManager: manager };
    const stop = powerhouseAppSource().subscribe(() => undefined);
    expect(listening()).toBe(1);
    stop();
    expect(listening()).toBe(0);
  });

  it("shows an error in the app's notifications", () => {
    const toast = vi.fn();
    window.ph = { toast };
    powerhouseAppSource().read().notifyError?.("It broke");
    expect(toast).toHaveBeenCalledExactlyOnceWith("It broke", {
      type: "error",
    });
  });

  it("takes a search param out through the app's router, with no history entry", () => {
    const setSearch = vi.fn();
    window.ph = { navigation: { setSearch } as never };
    powerhouseAppSource().read().removeSearchParam?.("ph-devtools");

    const [update, options] = setSearch.mock.calls[0] as [
      (prev: Record<string, string>) => Record<string, string>,
      { replace?: boolean },
    ];
    expect(update({ "ph-devtools": "build", tab: "files" })).toEqual({
      tab: "files",
    });
    expect(options).toEqual({ replace: true });
  });
});
