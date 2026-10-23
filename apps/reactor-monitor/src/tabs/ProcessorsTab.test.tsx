// @vitest-environment happy-dom
import type { InspectorProcessorInfo } from "@powerhousedao/reactor";
import type {
  MonitorInspector,
  ProcessorLevers,
} from "@powerhousedao/reactor-monitor";
import { fireEvent, render, waitFor } from "@testing-library/react";
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
