// @vitest-environment happy-dom
import { ensurePHStore } from "@powerhousedao/reactor-browser";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSearchParamDraft } from "./url-param.js";

const KEY = "runs.q";

beforeEach(() => {
  ensurePHStore().navigation = undefined;
  window.history.replaceState(null, "", "/d/studio");
});

afterEach(() => {
  cleanup();
});

describe("useSearchParamDraft", () => {
  it("writes typing to the URL and follows back and forward", () => {
    const { result } = renderHook(() => useSearchParamDraft(KEY));
    act(() => result.current[1]("a"));
    act(() => result.current[1]("ab"));
    expect(result.current[0]).toBe("ab");
    expect(new URLSearchParams(location.search).get(KEY)).toBe("ab");

    act(() => {
      window.history.pushState(null, "", `/d/studio?${KEY}=older`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current[0]).toBe("older");

    act(() => {
      window.history.pushState(null, "", "/d/studio");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current[0]).toBe("");
  });

  it("follows back to a value typing skipped over", () => {
    const { result } = renderHook(() => useSearchParamDraft(KEY));
    // One render for both: "a" never reaches the URL state as typed.
    act(() => {
      result.current[1]("a");
      result.current[1]("ab");
    });
    expect(result.current[0]).toBe("ab");

    act(() => {
      window.history.pushState(null, "", `/d/studio?${KEY}=a`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current[0]).toBe("a");
  });
});
