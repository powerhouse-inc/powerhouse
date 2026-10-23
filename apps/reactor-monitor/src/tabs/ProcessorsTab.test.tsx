// @vitest-environment happy-dom
import type {
  CatchUpStatus,
  InspectorProcessorInfo,
} from "@powerhousedao/reactor";
import type {
  MonitorInspector,
  ProcessorLevers,
} from "@powerhousedao/reactor-monitor";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessorsTab } from "./ProcessorsTab.js";

function processor(
  overrides: Partial<InspectorProcessorInfo> = {},
): InspectorProcessorInfo {
  return {
    processorId: "factory:drive:0",
    factoryId: "factory",
    driveId: "drive",
    processorIndex: 0,
    lastOrdinal: 40,
    status: "active",
    lastError: undefined,
    lastErrorTimestamp: undefined,
    floor: 10,
    clearable: true,
    runFrom: 40,
    phase: "live",
    ...overrides,
  };
}

function inspectorOf(processors: InspectorProcessorInfo[]): MonitorInspector {
  return {
    getProcessors: () => Promise.resolve(processors),
  } as unknown as MonitorInspector;
}

function leversStub(): ProcessorLevers & {
  rerunProcessor: ReturnType<typeof vi.fn>;
} {
  return {
    retryProcessor: vi.fn().mockResolvedValue(undefined),
    rerunProcessor: vi.fn().mockResolvedValue(undefined),
  };
}

async function openRerun(view: ReturnType<typeof render>) {
  await waitFor(() => expect(view.getByText("factory:drive:0")).toBeTruthy());
  fireEvent.click(view.getByRole("button", { name: "Rerun…" }));
  return view.getByTestId("rerun-form");
}

describe("ProcessorsTab rerun", () => {
  it("offers no rerun without levers, saying why", async () => {
    const view = render(
      <ProcessorsTab
        admin={{ enabled: false, reason: "no levers here" }}
        inspector={inspectorOf([processor()])}
      />,
    );
    await waitFor(() => expect(view.getByText("factory:drive:0")).toBeTruthy());

    expect(view.getByTestId("admin-gate-note").textContent).toBe(
      "no levers here",
    );
    expect(
      view.getByRole("button", { name: "Rerun…" }).getAttribute("disabled"),
    ).not.toBeNull();
  });

  it("clears and replays from the floor by default", async () => {
    const levers = leversStub();
    const view = render(
      <ProcessorsTab inspector={inspectorOf([processor()])} levers={levers} />,
    );
    await openRerun(view);

    expect(view.getByTestId("rerun-clear-note").textContent).toContain(
      "Replays from ordinal 10",
    );
    fireEvent.click(view.getByRole("button", { name: "Rerun" }));

    await waitFor(() =>
      expect(levers.rerunProcessor).toHaveBeenCalledWith("factory:drive:0", {
        clear: true,
        fromOrdinal: 10,
      }),
    );
    await waitFor(() =>
      expect(view.getByRole("status").textContent).toContain(
        "Rerun of factory:drive:0 is under way",
      ),
    );
    expect(view.queryByTestId("rerun-form")).toBeNull();
  });

  it("replays above an ordinal between the floor and the cursor", async () => {
    const levers = leversStub();
    const view = render(
      <ProcessorsTab inspector={inspectorOf([processor()])} levers={levers} />,
    );
    await openRerun(view);
    fireEvent.click(view.getByLabelText("Clear its read model first"));
    const ordinal = view.getByLabelText(/Replay operations above ordinal/);
    const rerun = view.getByRole("button", { name: "Rerun" });

    for (const outside of ["9", "41", "12.5", ""]) {
      fireEvent.change(ordinal, { target: { value: outside } });
      expect(rerun.getAttribute("disabled")).not.toBeNull();
    }

    fireEvent.change(ordinal, { target: { value: "25" } });
    fireEvent.click(rerun);
    await waitFor(() =>
      expect(levers.rerunProcessor).toHaveBeenCalledWith("factory:drive:0", {
        clear: false,
        fromOrdinal: 25,
      }),
    );
  });

  it("only replays a processor that cannot clear", async () => {
    const levers = leversStub();
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([processor({ clearable: false })])}
        levers={levers}
      />,
    );
    await openRerun(view);

    const clear = view.getByLabelText(
      "Clear its read model first",
    ) as HTMLInputElement;
    expect(clear.checked).toBe(false);
    expect(clear.disabled).toBe(true);
    expect(view.getByTestId("rerun-not-clearable")).toBeTruthy();
  });

  it("shows the host's refusal and keeps the form open", async () => {
    const levers = leversStub();
    levers.rerunProcessor.mockRejectedValue(
      new Error("can replay from ordinal 10 to 40, not 25"),
    );
    const view = render(
      <ProcessorsTab inspector={inspectorOf([processor()])} levers={levers} />,
    );
    await openRerun(view);
    fireEvent.click(view.getByRole("button", { name: "Rerun" }));

    await waitFor(() =>
      expect(view.getByRole("alert").textContent).toBe(
        "Rerun failed: can replay from ordinal 10 to 40, not 25",
      ),
    );
    expect(view.getByTestId("rerun-form")).toBeTruthy();
  });
});

function catchUpAt(head: number): CatchUpStatus {
  return {
    watermark: { head, settledThrough: head, waitingOn: [] },
    consumers: [],
  };
}

function bar(view: ReturnType<typeof render>, name: string) {
  return view.getByRole("progressbar", { name });
}

describe("ProcessorsTab progress", () => {
  const sektar = [
    processor({
      processorId: "sektar:mail:0",
      factoryId: "sektar",
      driveId: "mail",
      runFrom: 100,
      lastOrdinal: 150,
      phase: "catching-up",
    }),
    processor({
      processorId: "sektar:docs:0",
      factoryId: "sektar",
      driveId: "docs",
      runFrom: 200,
      lastOrdinal: 200,
      phase: "live",
    }),
    processor({
      processorId: "vetra:docs:0",
      factoryId: "vetra",
      driveId: "docs",
      runFrom: 200,
      lastOrdinal: 200,
      phase: "live",
    }),
  ];

  it("draws a bar per factory against the catch-up head", async () => {
    const inspector = {
      getProcessors: () => Promise.resolve(sektar),
      getCatchUpStatus: () => Promise.resolve(catchUpAt(300)),
    } as unknown as MonitorInspector;
    const view = render(<ProcessorsTab inspector={inspector} />);

    await waitFor(() =>
      expect(bar(view, "sektar (2 drives)").getAttribute("aria-valuenow")).toBe(
        "25",
      ),
    );
    const sektarBar = bar(view, "sektar (2 drives)");
    expect(sektarBar.getAttribute("aria-valuemin")).toBe("0");
    expect(sektarBar.getAttribute("aria-valuemax")).toBe("100");
    expect(sektarBar.getAttribute("aria-valuetext")).toBe(
      "25%, 50 of 200 ordinals",
    );
    const vetraBar = bar(view, "vetra (1 drive)");
    expect(vetraBar.getAttribute("aria-valuenow")).toBe("100");
    expect(vetraBar.getAttribute("aria-valuetext")).toBe("done");
    expect(view.queryByTestId("progress-head-unknown")).toBeNull();
    expect(view.getByText("sektar:mail:0")).toBeTruthy();
  });

  it("expands a factory to a bar per drive", async () => {
    const inspector = {
      getProcessors: () => Promise.resolve(sektar),
      getCatchUpStatus: () => Promise.resolve(catchUpAt(300)),
    } as unknown as MonitorInspector;
    const view = render(<ProcessorsTab inspector={inspector} />);
    const toggle = await waitFor(() =>
      view.getByRole("button", { name: "Show drives of sektar" }),
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(view.queryByTestId("progress-drives-sektar")).toBeNull();

    fireEvent.click(toggle);

    expect(
      view
        .getByRole("button", { name: "Hide drives of sektar" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(bar(view, "mail").getAttribute("aria-valuenow")).toBe("25");
    expect(bar(view, "docs").getAttribute("aria-valuetext")).toBe("done");
  });

  it("marks a factory errored when one of its processors is", async () => {
    const inspector = {
      getProcessors: () =>
        Promise.resolve([
          processor({
            status: "errored",
            phase: "errored",
            runFrom: 0,
            lastOrdinal: 40,
          }),
        ]),
      getCatchUpStatus: () => Promise.resolve(catchUpAt(80)),
    } as unknown as MonitorInspector;
    const view = render(<ProcessorsTab inspector={inspector} />);

    await waitFor(() =>
      expect(
        bar(view, "factory (1 drive)").getAttribute("aria-valuetext"),
      ).toBe("errored at 50%, 40 of 80 ordinals"),
    );
    expect(
      within(view.getByTestId("processor-progress")).getByText("errored"),
    ).toBeTruthy();
  });

  it("falls back to the highest cursor when catch-up status is refused", async () => {
    const inspector = {
      getProcessors: () =>
        Promise.resolve([
          processor({
            processorId: "f:a:0",
            factoryId: "f",
            driveId: "a",
            runFrom: 0,
            lastOrdinal: 30,
            phase: "catching-up",
          }),
          processor({
            processorId: "f:b:0",
            factoryId: "f",
            driveId: "b",
            runFrom: 60,
            lastOrdinal: 60,
          }),
        ]),
      getCatchUpStatus: () => Promise.reject(new Error("forbidden")),
    } as unknown as MonitorInspector;
    const view = render(<ProcessorsTab inspector={inspector} />);

    await waitFor(() =>
      expect(bar(view, "f (2 drives)").getAttribute("aria-valuenow")).toBe(
        "50",
      ),
    );
    expect(view.getByTestId("progress-head-unknown")).toBeTruthy();
    expect(view.queryByText(/Failed to load processors/)).toBeNull();
  });
});
