// @vitest-environment happy-dom
import type {
  CatchUpConsumerStatus,
  CatchUpStatus,
} from "@powerhousedao/reactor";
import type { MonitorInspector } from "@powerhousedao/reactor-monitor";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CatchUpTab } from "./CatchUpTab.js";

function consumer(
  consumerId: string,
  appliedThrough: number,
  extra: Partial<CatchUpConsumerStatus> = {},
): CatchUpConsumerStatus {
  return {
    consumerId,
    thread: "host",
    appliedThrough,
    trackedAbove: 0,
    lastAdvanceUtcMs: 0,
    ...extra,
  };
}

function inspectorOf(status: () => Promise<CatchUpStatus>): MonitorInspector {
  return { getCatchUpStatus: status } as unknown as MonitorInspector;
}

describe("CatchUpTab progress", () => {
  it("draws a bar per read model, leaving out the processor manager", async () => {
    const status: CatchUpStatus = {
      watermark: { head: 200, settledThrough: 200, waitingOn: [] },
      consumers: [
        consumer("document-view", 200),
        consumer("document-indexer", 50, { thread: "projection" }),
        consumer("processor-manager", 10),
        consumer("drive-nodes", 120, {
          blockedAt: {
            ordinal: 121,
            documentId: "doc",
            scope: "global",
            branch: "main",
            type: "SET",
            error: "boom",
          },
        }),
      ],
    };
    const view = render(
      <CatchUpTab inspector={inspectorOf(() => Promise.resolve(status))} />,
    );

    const indexer = await waitFor(() =>
      view.getByRole("progressbar", { name: "document-indexer" }),
    );
    expect(indexer.getAttribute("aria-valuenow")).toBe("25");
    expect(indexer.getAttribute("aria-valuemin")).toBe("0");
    expect(indexer.getAttribute("aria-valuemax")).toBe("100");
    expect(indexer.getAttribute("aria-valuetext")).toBe(
      "25%, applied through 50 of 200",
    );
    const documentView = view.getByRole("progressbar", {
      name: "document-view",
    });
    expect(documentView.getAttribute("aria-valuenow")).toBe("100");
    expect(documentView.getAttribute("aria-valuetext")).toBe(
      "done, applied through 200 of 200",
    );
    const blocked = view.getByRole("progressbar", { name: "drive-nodes" });
    expect(blocked.className).toContain("rm-progress-error");
    expect(blocked.getAttribute("aria-valuetext")).toContain("blocked");
    expect(
      view.queryByRole("progressbar", { name: "processor-manager" }),
    ).toBeNull();
    expect(view.getAllByRole("progressbar")).toHaveLength(3);
    expect(view.getByText("per factory on Processors")).toBeTruthy();
    const table = view.getByTestId("read-model-progress");
    expect(table.tagName).toBe("TABLE");
    expect(table.querySelectorAll('[role="progressbar"]')).toHaveLength(3);
  });

  it("draws no bars when the status cannot be read", async () => {
    const view = render(
      <CatchUpTab
        inspector={inspectorOf(() => Promise.reject(new Error("refused")))}
      />,
    );

    await waitFor(() =>
      expect(view.getByText(/Catch-up request failed: refused/)).toBeTruthy(),
    );
    expect(view.queryAllByRole("progressbar")).toHaveLength(0);
  });

  it("draws no bars for a status without a watermark", async () => {
    const status = {
      watermark: null,
      consumers: [consumer("document-view", 10)],
    } as unknown as CatchUpStatus;
    const view = render(
      <CatchUpTab inspector={inspectorOf(() => Promise.resolve(status))} />,
    );

    await waitFor(() => expect(view.getByText("document-view")).toBeTruthy());
    expect(view.queryByRole("progressbar")).toBeNull();
  });
});
