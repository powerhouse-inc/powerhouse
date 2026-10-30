// @vitest-environment happy-dom
import type {
  KeyframeCleanupRun,
  KeyframeReclaim,
} from "@powerhousedao/reactor";
import type { KeyframeLevers } from "@powerhousedao/reactor-monitor";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyframesTab } from "./KeyframesTab.js";

function runOf(
  overrides: Partial<KeyframeCleanupRun> = {},
): KeyframeCleanupRun {
  return {
    id: "run-1",
    dryRun: true,
    state: "done",
    startedAtUtcMs: 1,
    finishedAtUtcMs: 2,
    documentsTotal: 10,
    documentsSeen: 10,
    parked: false,
    totals: {
      streams: 3,
      rows: 40,
      bytes: 5 * 1024 * 1024,
      removableRows: 12,
      removableBytes: 2 * 1024 * 1024,
      removedRows: 0,
      removedBytes: 0,
    },
    types: [
      {
        documentType: "sektar/email",
        keep: 1,
        interval: 50,
        streams: 3,
        rows: 40,
        bytes: 5 * 1024 * 1024,
        removableRows: 12,
        removableBytes: 2 * 1024 * 1024,
        removedRows: 0,
        removedBytes: 0,
      },
    ],
    reasons: [
      { reason: "beyond-keep", rows: 10, bytes: 1024 * 1024 },
      { reason: "deleted-document", rows: 2, bytes: 1024 * 1024 },
    ],
    topStreams: [
      {
        documentId: "doc-1",
        documentType: "sektar/email",
        scope: "global",
        branch: "main",
        reason: "beyond-keep",
        rows: 12,
        bytes: 1024,
        removableRows: 10,
        removableBytes: 1024,
      },
    ],
    error: null,
    ...overrides,
  };
}

function reclaimOf(overrides: Partial<KeyframeReclaim> = {}): KeyframeReclaim {
  return {
    state: "done",
    startedAtUtcMs: 1,
    finishedAtUtcMs: 2,
    tableBytesBefore: 3 * 1024 ** 3,
    tableBytesAfter: 200 * 1024 ** 2,
    durationMs: 900,
    message: "The Keyframe table was rewritten.",
    ...overrides,
  };
}

function leversWith(overrides: Partial<KeyframeLevers> = {}): KeyframeLevers {
  return {
    startKeyframeCleanup: vi.fn(({ dryRun }: { dryRun: boolean }) =>
      Promise.resolve(runOf({ dryRun })),
    ),
    getKeyframeCleanup: vi.fn(() => Promise.resolve(null)),
    cancelKeyframeCleanup: vi.fn(() => Promise.resolve()),
    reclaimKeyframeSpace: vi.fn(() => Promise.resolve(reclaimOf())),
    getKeyframeReclaim: vi.fn(() => Promise.resolve(null)),
    ...overrides,
  };
}

describe("KeyframesTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers nothing without the levers and says why", () => {
    const view = render(
      <KeyframesTab admin={{ enabled: false, reason: "not an admin" }} />,
    );

    expect(view.getByTestId("admin-gate-note").textContent).toBe(
      "not an admin",
    );
    for (const name of ["Preview", "Clean up", "Reclaim space"]) {
      expect(
        (view.getByRole("button", { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
  });

  it("previews with a dry run and shows types, reasons and top streams", async () => {
    const levers = leversWith();
    const view = render(<KeyframesTab levers={levers} />);

    fireEvent.click(view.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(view.getByTestId("keyframe-report")).toBeTruthy();
    });
    expect(levers.startKeyframeCleanup).toHaveBeenCalledWith({ dryRun: true });
    expect(view.getByTestId("keyframe-types").textContent).toContain(
      "sektar/email",
    );
    expect(view.getByTestId("keyframe-reasons").textContent).toContain(
      "Deleted documents: 2 keyframes, 1.0 MB",
    );
    expect(view.getByTestId("keyframe-top-streams").textContent).toContain(
      "doc-1",
    );
    expect(view.queryByText("Removed:")).toBeNull();
  });

  it("confirms a clean-up with the preview's numbers before it starts", async () => {
    const levers = leversWith({
      getKeyframeCleanup: vi.fn(() => Promise.resolve(runOf())),
    });
    const view = render(<KeyframesTab levers={levers} />);
    await waitFor(() => {
      expect(view.getByTestId("keyframe-report")).toBeTruthy();
    });

    fireEvent.click(view.getByRole("button", { name: "Clean up" }));

    expect(view.getByTestId("keyframe-confirm").textContent).toContain(
      "This deletes 12 keyframes (2.0 MB)",
    );
    expect(levers.startKeyframeCleanup).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(levers.startKeyframeCleanup).toHaveBeenCalledWith({
        dryRun: false,
      });
    });
    expect(view.queryByTestId("keyframe-confirm")).toBeNull();
  });

  it("does not start a clean-up on Cancel", async () => {
    const levers = leversWith();
    const view = render(<KeyframesTab levers={levers} />);
    await waitFor(() => {
      expect(levers.getKeyframeCleanup).toHaveBeenCalled();
    });

    fireEvent.click(view.getByRole("button", { name: "Clean up" }));
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));

    expect(view.queryByTestId("keyframe-confirm")).toBeNull();
    expect(levers.startKeyframeCleanup).not.toHaveBeenCalled();
  });

  it("polls progress while a run goes and shows the result", async () => {
    const running = runOf({
      dryRun: false,
      state: "running",
      documentsSeen: 5,
      finishedAtUtcMs: null,
    });
    const done = runOf({
      dryRun: false,
      totals: { ...running.totals, removedRows: 12 },
    });
    const getKeyframeCleanup = vi
      .fn<KeyframeLevers["getKeyframeCleanup"]>()
      .mockResolvedValueOnce(running)
      .mockResolvedValue(done);
    const levers = leversWith({ getKeyframeCleanup });

    const view = render(<KeyframesTab levers={levers} pollIntervalMs={5} />);

    const bar = await waitFor(() =>
      view.getByRole("progressbar", { name: "Clean-up" }),
    );
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    expect(
      (view.getByRole("button", { name: "Preview" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await waitFor(() => {
      expect(view.queryByTestId("keyframe-progress")).toBeNull();
    });
    expect(view.getByText(/Removed:/).textContent).toContain("12");
  });

  it("stops a running run", async () => {
    const levers = leversWith({
      getKeyframeCleanup: vi.fn(() =>
        Promise.resolve(runOf({ state: "running", dryRun: false })),
      ),
    });
    const view = render(<KeyframesTab levers={levers} />);

    fireEvent.click(await view.findByRole("button", { name: "Stop" }));

    await waitFor(() => {
      expect(levers.cancelKeyframeCleanup).toHaveBeenCalled();
    });
  });

  it("shows a refused lever and a failed run", async () => {
    const levers = leversWith({
      getKeyframeCleanup: vi.fn(() =>
        Promise.resolve(runOf({ state: "failed", error: "store gone" })),
      ),
      startKeyframeCleanup: vi.fn(() =>
        Promise.reject(new Error("A keyframe clean-up is already running")),
      ),
    });
    const view = render(<KeyframesTab levers={levers} />);

    await view.findByText("The run failed: store gone");
    fireEvent.click(view.getByRole("button", { name: "Preview" }));

    await view.findByText("A keyframe clean-up is already running");
  });

  it("reclaims after a warning and shows the sizes", async () => {
    const levers = leversWith();
    const view = render(<KeyframesTab levers={levers} />);
    await waitFor(() => {
      expect(levers.getKeyframeReclaim).toHaveBeenCalled();
    });

    fireEvent.click(view.getByRole("button", { name: "Reclaim space" }));
    expect(view.getByTestId("keyframe-confirm").textContent).toContain(
      "rewrites the Keyframe table",
    );
    fireEvent.click(view.getByRole("button", { name: "Confirm" }));

    const report = await view.findByTestId("keyframe-reclaim");
    expect(report.textContent).toContain("3.00 GB to 200.0 MB");
  });

  it("shows what to do by hand where the store cannot reclaim", async () => {
    const levers = leversWith({
      getKeyframeReclaim: vi.fn(() =>
        Promise.resolve(
          reclaimOf({
            state: "unsupported",
            tableBytesBefore: null,
            tableBytesAfter: null,
            message: "use pg_repack",
          }),
        ),
      ),
    });
    const view = render(<KeyframesTab levers={levers} />);

    const report = await view.findByTestId("keyframe-reclaim");
    expect(report.textContent).toBe("use pg_repack");
  });
});
