import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectTooltipProvider } from "../../tooltip/tooltip.js";
import { globalOperations } from "../mocks.js";
import { Timeline } from "./timeline.js";

function renderTimeline(operationCount: number) {
  return render(
    <ConnectTooltipProvider>
      <Timeline operations={globalOperations.slice(0, operationCount)} />
    </ConnectTooltipProvider>,
  );
}

describe("Timeline", () => {
  it("renders revisions without throwing", () => {
    expect(() => renderTimeline(10)).not.toThrow();
  });

  it("does not throw and keeps rendering when the operations list shrinks", () => {
    const { rerender, container } = render(
      <ConnectTooltipProvider>
        <Timeline operations={globalOperations.slice(0, 10)} />
      </ConnectTooltipProvider>,
    );

    expect(() => {
      rerender(
        <ConnectTooltipProvider>
          <Timeline operations={globalOperations.slice(0, 5)} />
        </ConnectTooltipProvider>,
      );
    }).not.toThrow();

    expect(() => {
      rerender(
        <ConnectTooltipProvider>
          <Timeline operations={globalOperations.slice(0, 1)} />
        </ConnectTooltipProvider>,
      );
    }).not.toThrow();

    // happy-dom has no layout, so the virtualizer may render zero rows here;
    // the meaningful assertion is that shrinking did not throw and the
    // container is still present.
    expect(container).toBeInTheDocument();
  });

  // The virtualizer only windows rows if its scroll element is a viewport --
  // something with a bounded height that can scroll. Sizing the scroll
  // element itself to getTotalSize() made the viewport exactly as tall as its
  // content, so nothing ever scrolled and every row counted as visible: the
  // virtualizer was paying for itself and rendering the whole page anyway.
  // The full height belongs on an inner sizer instead.
  it("bounds the scroll container instead of growing it to the content height", () => {
    const { getByTestId } = renderTimeline(60);
    const scroller = getByTestId("revision-timeline");

    expect(scroller.style.overflowY).toBe("auto");
    expect(scroller.style.maxHeight).not.toBe("");
    // The content height belongs to the sizer, not the viewport.
    expect(scroller.style.height).toBe("");

    const sizer = scroller.firstElementChild as HTMLElement | null;
    expect(sizer).not.toBeNull();
    expect(sizer!.style.height).toMatch(/^\d+(\.\d+)?px$/);
  });

  // The old component grew the visible row count from a wheel listener bound
  // to window, so every wheel event anywhere in the app set state on a
  // mounted timeline, and the count it derived was independent of where the
  // timeline had actually been scrolled to. The virtualizer does this from
  // the scroll element itself once that element is a real viewport.
  it("does not install a global wheel listener", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    try {
      renderTimeline(60);
      const wheelListeners = addEventListener.mock.calls.filter(
        ([type]) => type === "wheel",
      );
      expect(wheelListeners).toHaveLength(0);
    } finally {
      addEventListener.mockRestore();
    }
  });
});
