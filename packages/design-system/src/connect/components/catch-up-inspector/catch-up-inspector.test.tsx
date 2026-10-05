import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CatchUpStatus } from "./catch-up-inspector.js";
import { CatchUpInspector } from "./catch-up-inspector.js";

const status: CatchUpStatus = {
  watermark: {
    head: 120,
    settledThrough: 100,
    waitingOn: ["7431", "7432"],
    stalledSinceUtcMs: Date.now() - 90_000,
  },
  consumers: [
    {
      consumerId: "document-view",
      thread: "host",
      appliedThrough: 100,
      trackedAbove: 3,
      lastAdvanceUtcMs: Date.UTC(2026, 8, 25, 12, 0, 0),
    },
    {
      consumerId: "processor-manager",
      thread: "projection",
      appliedThrough: 94,
      trackedAbove: 0,
      lastAdvanceUtcMs: Date.UTC(2026, 8, 25, 11, 59, 0),
      blockedAt: {
        ordinal: 95,
        documentId: "doc-blocked",
        scope: "global",
        branch: "main",
        type: "powerhouse/budget-statement",
        error: "reducer threw",
      },
    },
  ],
};

function row(consumerId: string): HTMLElement {
  const cell = screen.getByTitle(consumerId);
  const tr = cell.closest("tr");
  if (!tr) throw new Error(`no row for ${consumerId}`);
  return tr;
}

function cellTexts(tr: HTMLElement): string[] {
  return Array.from(tr.querySelectorAll("td")).map((td) => td.textContent);
}

describe("CatchUpInspector", () => {
  it("renders the watermark and every consumer from a fixed CatchUpStatus", async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(
      <CatchUpInspector
        onRefresh={onRefresh}
        onSweepNow={() => Promise.resolve()}
        status={status}
      />,
    );

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());

    expect(screen.getByText("Head:").textContent).toBe("Head: 120");
    expect(screen.getByText(/Settled through:/).textContent).toBe(
      "Settled through: 100",
    );
    expect(screen.getByText(/^Lag:/).textContent).toBe("Lag: 20");
    expect(screen.getByText(/Waiting on:/).textContent).toBe(
      "Waiting on: 7431, 7432",
    );
    expect((await screen.findByText(/Stalled for:/)).textContent).toMatch(
      /Stalled for: 1m 3\ds/,
    );

    const host = cellTexts(row("document-view"));
    expect(host.slice(0, 5)).toEqual([
      "document-view",
      "host",
      "100",
      "0",
      "3",
    ]);
    expect(host.slice(6)).toEqual(["-", "-", "-", "-", "-", "-"]);

    const blocked = cellTexts(row("processor-manager"));
    expect(blocked.slice(0, 5)).toEqual([
      "processor-manager",
      "projection",
      "94",
      "6",
      "0",
    ]);
    expect(blocked.slice(6)).toEqual([
      "95",
      "doc-blocked",
      "global",
      "main",
      "powerhouse/budget-statement",
      "reducer threw",
    ]);

    expect(screen.getByText("Showing 2 consumer(s)")).toBeDefined();
  });

  it("calls onSweepNow and then onRefresh when Sweep now is clicked", async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const onSweepNow = vi.fn(() => Promise.resolve());
    render(
      <CatchUpInspector
        onRefresh={onRefresh}
        onSweepNow={onSweepNow}
        status={status}
      />,
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Sweep now" }));

    await waitFor(() => expect(onSweepNow).toHaveBeenCalledOnce());
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(2));
  });

  it("shows the error when a refresh fails", async () => {
    render(
      <CatchUpInspector
        onRefresh={() => Promise.reject(new Error("worker gone"))}
        onSweepNow={() => Promise.resolve()}
        status={undefined}
      />,
    );

    expect(
      await screen.findByText("Catch-up request failed: worker gone"),
    ).toBeDefined();
    expect(screen.getByText("No catch-up consumers")).toBeDefined();
  });
});
