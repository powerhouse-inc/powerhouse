import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
