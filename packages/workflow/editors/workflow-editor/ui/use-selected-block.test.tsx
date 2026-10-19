// @vitest-environment happy-dom
import { ensurePHStore } from "@powerhousedao/reactor-browser";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSearchParam } from "../../shared/url-param.js";
import { RUNS_PARAMS } from "../../workflow-studio/components/RunsTable.js";
import { TAB_PARAM, VARIABLES_VIEW } from "./model.js";
import { useSelectedBlock } from "./use-selected-block.js";

const DOC = "/d/studio-drive/workflow-1";
const TABS = ["setup", "run", "settings"] as const;

const search = () => Object.fromEntries(new URLSearchParams(location.search));

beforeEach(() => {
  ensurePHStore().navigation = undefined;
  window.history.replaceState(null, "", DOC);
});

afterEach(() => {
  cleanup();
});

describe("workflow editor URL state", () => {
  it("keeps the open step in the step param, one entry per pick", () => {
    const { result } = renderHook(() => ({
      block: useSelectedBlock(),
      tab: useSearchParam(TAB_PARAM, "setup", TABS),
    }));
    expect(result.current.block[0]).toBeNull();

    const length = history.length;
    act(() => result.current.block[1]("step-a"));
    expect(search()).toEqual({ step: "step-a" });
    expect(history.length).toBe(length + 1);

    // Tabs replace; the default tab stays out of the URL.
    act(() => result.current.tab[1]("run", { replace: true }));
    expect(search()).toEqual({ step: "step-a", tab: "run" });
    act(() => result.current.tab[1]("setup", { replace: true }));
    expect(search()).toEqual({ step: "step-a" });
    act(() => result.current.tab[1]("settings", { replace: true }));
    expect(history.length).toBe(length + 1);

    // Another step opens on its first tab; reselecting adds no entry.
    act(() => result.current.block[1]("step-b"));
    expect(search()).toEqual({ step: "step-b" });
    expect(result.current.tab[0]).toBe("setup");
    act(() => result.current.block[1]("step-b"));
    expect(history.length).toBe(length + 2);

    act(() => result.current.block[1](VARIABLES_VIEW));
    expect(search()).toEqual({ step: "variables" });
    expect(result.current.block[0]).toBe(VARIABLES_VIEW);

    act(() => result.current.block[1](null));
    expect(location.search).toBe("");
    expect(location.pathname).toBe(DOC);
  });

  it("reads unknown values as the default", () => {
    window.history.replaceState(null, "", `${DOC}?tab=bogus`);
    const { result } = renderHook(() =>
      useSearchParam(TAB_PARAM, "setup", TABS),
    );
    expect(result.current[0]).toBe("setup");
  });

  it("namespaces the runs filters and keeps defaults out", () => {
    const { result } = renderHook(() =>
      useSearchParam<string>(RUNS_PARAMS.status, "ALL"),
    );
    const length = history.length;
    act(() => result.current[1]("FAILED", { replace: true }));
    expect(search()).toEqual({ "runs.status": "FAILED" });
    act(() => result.current[1]("ALL", { replace: true }));
    expect(location.search).toBe("");
    expect(history.length).toBe(length);
  });
});
