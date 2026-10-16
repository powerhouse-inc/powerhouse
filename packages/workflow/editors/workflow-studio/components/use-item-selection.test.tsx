// @vitest-environment happy-dom
import { ensurePHStore } from "@powerhousedao/reactor-browser";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useItemSelection } from "./use-item-selection.js";

const DRIVE = "/d/studio-drive";

function render(openEditorId?: string) {
  return renderHook(({ editor }) => useItemSelection(editor), {
    initialProps: { editor: openEditorId },
  });
}

const search = () => Object.fromEntries(new URLSearchParams(location.search));

beforeEach(() => {
  ensurePHStore().navigation = undefined;
  window.history.replaceState(null, "", DRIVE);
});

afterEach(() => {
  cleanup();
});

describe("studio item selection", () => {
  it("keeps the selection in the item query param, one entry per pick", () => {
    const { result } = render();
    expect(result.current[0]).toBeUndefined();

    const length = history.length;
    act(() => result.current[1]("wf-1"));
    expect(result.current[0]).toBe("wf-1");
    expect(search()).toEqual({ item: "wf-1" });
    expect(history.length).toBe(length + 1);

    act(() => result.current[1]("wf-2", { replace: true }));
    expect(result.current[0]).toBe("wf-2");
    expect(history.length).toBe(length + 1);

    // Reselecting the same item adds no entry.
    act(() => result.current[1]("wf-2"));
    expect(history.length).toBe(length + 1);

    act(() => result.current[1](undefined));
    expect(result.current[0]).toBeUndefined();
    expect(location.search).toBe("");
    expect(location.pathname).toBe(DRIVE);
  });

  it("opens another editor and selects its item in one entry", () => {
    const { result, rerender } = render();
    const length = history.length;

    act(() => result.current[2]("wf-1", "wf-1"));
    expect(location.pathname).toBe(`${DRIVE}/wf-1`);
    expect(search()).toEqual({ item: "wf-1" });
    expect(history.length).toBe(length + 1);
    expect(result.current[0]).toBe("wf-1");

    // Back to the runs view of the same item, again one entry.
    rerender({ editor: "wf-1" });
    act(() => result.current[2]("wf-1"));
    expect(location.pathname).toBe(DRIVE);
    expect(search()).toEqual({ item: "wf-1" });
    expect(history.length).toBe(length + 2);
  });

  it("moves a legacy hash selection into the query param", () => {
    window.history.replaceState(null, "", `${DRIVE}?theme=dark#wf-old`);
    const length = history.length;
    const { result } = render();

    expect(result.current[0]).toBe("wf-old");
    expect(search()).toEqual({ theme: "dark", item: "wf-old" });
    expect(location.hash).toBe("");
    expect(history.length).toBe(length);
  });

  it("prefers the query param over a legacy hash", () => {
    window.history.replaceState(null, "", `${DRIVE}?item=wf-new#wf-old`);
    const { result } = render();
    expect(result.current[0]).toBe("wf-new");
    expect(search()).toEqual({ item: "wf-new" });
  });
});
