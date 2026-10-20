// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorLoader } from "./editor-loader.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EditorLoader", () => {
  it("shows nothing for a short load", () => {
    vi.useFakeTimers();
    render(<EditorLoader message="Loading editor" />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByText("Loading editor")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText("Loading editor")).toBeDefined();
  });

  it("shows at once without a delay", () => {
    render(<EditorLoader message="Loading editor" loadingTimeout={0} />);
    expect(screen.getByText("Loading editor")).toBeDefined();
  });
});
