import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useTheme } from "../src/hooks/theme.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORED_THEME_KEY = "ph:theme";

function fireStorageEvent(key: string | null, newValue: string | null) {
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
  });
}

describe("useTheme", () => {
  afterEach(() => {
    localStorage.removeItem(STORED_THEME_KEY);
  });

  it("re-reads the stored theme on a same-origin storage event", () => {
    localStorage.removeItem(STORED_THEME_KEY);
    const { result } = renderHook(() => useTheme());
    expect(result.current.isSystem).toBe(true);

    // Simulate another browsing context (e.g. the embedding parent window)
    // writing the key: direct storage write + the storage event it fires.
    localStorage.setItem(STORED_THEME_KEY, "dark");
    fireStorageEvent(STORED_THEME_KEY, "dark");

    expect(result.current.theme).toBe("dark");
    expect(result.current.isSystem).toBe(false);
  });

  it("ignores storage events for unrelated keys", () => {
    localStorage.setItem(STORED_THEME_KEY, "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");

    localStorage.setItem(STORED_THEME_KEY, "dark");
    fireStorageEvent("some:other-key", "value");

    // Not re-read: the event's key doesn't match.
    expect(result.current.theme).toBe("light");
  });

  it("re-reads on storage.clear (null key)", () => {
    localStorage.setItem(STORED_THEME_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");

    localStorage.removeItem(STORED_THEME_KEY);
    fireStorageEvent(null, null);

    expect(result.current.isSystem).toBe(true);
  });
});
