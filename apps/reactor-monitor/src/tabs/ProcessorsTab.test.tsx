// @vitest-environment happy-dom
import type {
  CatchUpPriorityState,
  CatchUpStatus,
  InspectorProcessorInfo,
} from "@powerhousedao/reactor";
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
    runFrom: 40,
    phase: "live",
    ...overrides,
  };
}

function inspectorOf(
  processors: InspectorProcessorInfo[],
  catchUp?: CatchUpStatus,
  priority?: () => CatchUpPriorityState,
): MonitorInspector {
  return {
    getProcessors: () => Promise.resolve(processors),
    getCatchUpStatus: () =>
      catchUp ? Promise.resolve(catchUp) : Promise.reject(new Error("none")),
    getCatchUpPriority: () =>
      priority
        ? Promise.resolve(priority())
        : Promise.reject(new Error("none")),
  } as unknown as MonitorInspector;
}

function leversStub(): ProcessorLevers & {
  rerunProcessor: ReturnType<typeof vi.fn>;
  setCatchUpPriority: ReturnType<typeof vi.fn>;
} {
  return {
    retryProcessor: vi.fn().mockResolvedValue(undefined),
    rerunProcessor: vi.fn().mockResolvedValue(undefined),
    setCatchUpPriority: vi.fn().mockResolvedValue(undefined),
  };
}

function priorityAt(
  overrides: Partial<CatchUpPriorityState> = {},
): CatchUpPriorityState {
  return {
    mode: "dynamic",
    level: 6,
    settings: { slots: 6, pageSize: 1000, pauseMs: 0, giveWay: "yield" },
    reason: "idle 14 s",
    sample: undefined,
    ...overrides,
  };
}

function catchUpAt(head: number): CatchUpStatus {
  return {
    watermark: { head, settledThrough: head, waitingOn: [] },
    consumers: [],
  };
}

const rerunButton = (view: ReturnType<typeof render>) =>
  view.getByRole("button", { name: /^Rerun \d+ processors?$/ });

async function loaded(view: ReturnType<typeof render>, processorId: string) {
  return waitFor(() => view.getByLabelText(`Select ${processorId}`));
}

describe("ProcessorsTab selection and rerun", () => {
  it("counts the selection on the Rerun button, disabled while none is selected", async () => {
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([
          processor(),
          processor({ processorId: "factory:other:0", driveId: "other" }),
        ])}
        levers={leversStub()}
      />,
    );
    const first = await loaded(view, "factory:drive:0");

    expect(rerunButton(view).textContent).toBe("Rerun 0 processors");
    expect(rerunButton(view).getAttribute("disabled")).not.toBeNull();

    fireEvent.click(first);
    expect(rerunButton(view).textContent).toBe("Rerun 1 processor");
    expect(rerunButton(view).getAttribute("disabled")).toBeNull();

    fireEvent.click(view.getByLabelText("Select every processor"));
    expect(rerunButton(view).textContent).toBe("Rerun 2 processors");

    fireEvent.click(view.getByLabelText("Select every processor"));
    expect(rerunButton(view).textContent).toBe("Rerun 0 processors");
  });

  it("selects a factory's processors from its row, and shows it mixed when some are", async () => {
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([
          processor({
            processorId: "sektar:mail:0",
            factoryId: "sektar",
            driveId: "mail",
          }),
          processor({
            processorId: "sektar:docs:0",
            factoryId: "sektar",
            driveId: "docs",
          }),
          processor({
            processorId: "vetra:docs:0",
            factoryId: "vetra",
            driveId: "docs",
          }),
        ])}
        levers={leversStub()}
      />,
    );
    await loaded(view, "sektar:mail:0");
    const factory = view.getByLabelText(
      "Select every processor of sektar",
    ) as HTMLInputElement;

    fireEvent.click(view.getByLabelText("Select sektar:mail:0"));
    expect(factory.indeterminate).toBe(true);
    expect(factory.checked).toBe(false);

    fireEvent.click(factory);
    expect(factory.checked).toBe(true);
    expect(rerunButton(view).textContent).toBe("Rerun 2 processors");
  });

  it("offers no rerun without levers, saying why", async () => {
    const view = render(
      <ProcessorsTab
        admin={{ enabled: false, reason: "no levers here" }}
        inspector={inspectorOf([processor()])}
      />,
    );
    const box = (await loaded(view, "factory:drive:0")) as HTMLInputElement;

    expect(view.getByTestId("admin-gate-note").textContent).toBe(
      "no levers here",
    );
    expect(box.disabled).toBe(true);
    expect(rerunButton(view).getAttribute("disabled")).not.toBeNull();
  });

  it("clears and replays every selected processor from its floor by default", async () => {
    const levers = leversStub();
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([
          processor(),
          processor({
            processorId: "factory:other:0",
            driveId: "other",
            floor: 3,
          }),
        ])}
        levers={levers}
      />,
    );
    await loaded(view, "factory:drive:0");
    fireEvent.click(view.getByLabelText("Select every processor"));
    fireEvent.click(rerunButton(view));

    expect(view.getByTestId("rerun-clear-note").textContent).toContain(
      "Replays each from its first ordinal",
    );
    fireEvent.click(
      view.getByTestId("rerun-form").querySelector('button[type="submit"]')!,
    );

    await waitFor(() => expect(levers.rerunProcessor).toHaveBeenCalledTimes(2));
    expect(levers.rerunProcessor).toHaveBeenCalledWith("factory:drive:0", {
      clear: true,
      fromOrdinal: 10,
    });
    expect(levers.rerunProcessor).toHaveBeenCalledWith("factory:other:0", {
      clear: true,
      fromOrdinal: 3,
    });
    await waitFor(() => expect(view.queryByTestId("rerun-form")).toBeNull());
    expect(view.queryByRole("status")).toBeNull();
    expect(rerunButton(view).textContent).toBe("Rerun 0 processors");
  });

  it("replays one processor above an ordinal between its floor and its cursor", async () => {
    const levers = leversStub();
    const view = render(
      <ProcessorsTab inspector={inspectorOf([processor()])} levers={levers} />,
    );
    fireEvent.click(await loaded(view, "factory:drive:0"));
    fireEvent.click(rerunButton(view));
    fireEvent.click(view.getByLabelText("Clear its read model first"));
    const ordinal = view.getByLabelText(/Replay operations above ordinal/);
    const submit = view
      .getByTestId("rerun-form")
      .querySelector('button[type="submit"]') as HTMLButtonElement;

    for (const outside of ["9", "41", "12.5", ""]) {
      fireEvent.change(ordinal, { target: { value: outside } });
      expect(submit.disabled).toBe(true);
    }

    fireEvent.change(ordinal, { target: { value: "25" } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(levers.rerunProcessor).toHaveBeenCalledWith("factory:drive:0", {
        clear: false,
        fromOrdinal: 25,
      }),
    );
  });

  it("only replays when a selected processor cannot clear", async () => {
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([
          processor(),
          processor({
            processorId: "factory:other:0",
            driveId: "other",
            clearable: false,
          }),
        ])}
        levers={leversStub()}
      />,
    );
    await loaded(view, "factory:drive:0");
    fireEvent.click(view.getByLabelText("Select every processor"));
    fireEvent.click(rerunButton(view));

    const clear = view.getByLabelText(
      "Clear their read models first",
    ) as HTMLInputElement;
    expect(clear.checked).toBe(false);
    expect(clear.disabled).toBe(true);
    expect(view.getByTestId("rerun-not-clearable").textContent).toContain(
      "1 of these cannot",
    );
    expect(view.getByTestId("rerun-replay-note")).toBeTruthy();
  });

  it("names each refusal and keeps the form open", async () => {
    const levers = leversStub();
    levers.rerunProcessor.mockRejectedValue(new Error("it is not running"));
    const view = render(
      <ProcessorsTab inspector={inspectorOf([processor()])} levers={levers} />,
    );
    fireEvent.click(await loaded(view, "factory:drive:0"));
    fireEvent.click(rerunButton(view));
    fireEvent.click(
      view.getByTestId("rerun-form").querySelector('button[type="submit"]')!,
    );

    await waitFor(() =>
      expect(view.getByRole("alert").textContent).toBe(
        "Rerun failed: factory:drive:0: it is not running",
      ),
    );
    expect(view.getByTestId("rerun-form")).toBeTruthy();
  });
});

function bar(view: ReturnType<typeof render>, name: string) {
  return view.getByRole("progressbar", { name });
}

describe("ProcessorsTab progress in the table", () => {
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

  it("heads each factory's rows with its bar, against the catch-up head", async () => {
    const view = render(
      <ProcessorsTab inspector={inspectorOf(sektar, catchUpAt(300))} />,
    );

    await waitFor(() =>
      expect(bar(view, "sektar (2 drives)").getAttribute("aria-valuenow")).toBe(
        "62",
      ),
    );
    expect(bar(view, "sektar (2 drives)").getAttribute("aria-valuetext")).toBe(
      "62%, 1 of 2 processors done",
    );
    expect(bar(view, "vetra (1 drive)").getAttribute("aria-valuetext")).toBe(
      "done, 1 of 1 processors done",
    );
    expect(view.queryByTestId("progress-head-unknown")).toBeNull();
  });

  it("gives every processor row its own bar", async () => {
    const view = render(
      <ProcessorsTab inspector={inspectorOf(sektar, catchUpAt(300))} />,
    );

    await waitFor(() =>
      expect(bar(view, "sektar:mail:0").getAttribute("aria-valuenow")).toBe(
        "25",
      ),
    );
    expect(bar(view, "sektar:docs:0").getAttribute("aria-valuetext")).toBe(
      "done",
    );
    const rows = [
      ...view.getByTestId("processor-progress").querySelectorAll("tbody tr"),
    ];
    expect(rows.map((row) => row.className)).toEqual([
      "rm-factory-row",
      "",
      "",
      "rm-factory-row",
      "",
    ]);
  });

  it("collapses and expands a factory's processor rows", async () => {
    const view = render(
      <ProcessorsTab inspector={inspectorOf(sektar, catchUpAt(300))} />,
    );
    const collapse = await waitFor(() =>
      view.getByRole("button", { name: "Collapse sektar" }),
    );
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    expect(view.queryByLabelText("Select sektar:mail:0")).toBeTruthy();

    fireEvent.click(collapse);

    expect(view.queryByLabelText("Select sektar:mail:0")).toBeNull();
    expect(view.queryByLabelText("Select vetra:docs:0")).toBeTruthy();
    expect(bar(view, "sektar (2 drives)")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Expand sektar" }));
    expect(view.queryByLabelText("Select sektar:mail:0")).toBeTruthy();
  });

  it("marks a factory errored when one of its processors is", async () => {
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf(
          [
            processor({
              status: "errored",
              phase: "errored",
              runFrom: 0,
              lastOrdinal: 40,
            }),
          ],
          catchUpAt(80),
        )}
      />,
    );

    await waitFor(() =>
      expect(
        bar(view, "factory (1 drive)").getAttribute("aria-valuetext"),
      ).toBe("errored at 50%, 0 of 1 processors done"),
    );
  });

  it("falls back to the highest cursor when catch-up status is refused", async () => {
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([
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
        ])}
      />,
    );

    await waitFor(() =>
      expect(bar(view, "f (2 drives)").getAttribute("aria-valuenow")).toBe(
        "75",
      ),
    );
    expect(view.getByTestId("progress-head-unknown")).toBeTruthy();
    expect(view.queryByText(/Failed to load processors/)).toBeNull();
  });
});

describe("ProcessorsTab catch-up priority", () => {
  const prioritySelect = (view: ReturnType<typeof render>) =>
    view.getByLabelText("Catch-up priority") as HTMLSelectElement;

  it("shows the priority it reads, dynamic with the controller's reason", async () => {
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([processor()], undefined, () => priorityAt())}
        levers={leversStub()}
      />,
    );

    await waitFor(() =>
      expect(view.getByTestId("catch-up-priority").textContent).toBe(
        "Priority 6 · dynamic · idle 14 s",
      ),
    );
    expect(prioritySelect(view).value).toBe("dynamic");
    expect(prioritySelect(view).disabled).toBe(false);
  });

  it("shows a fixed level without a reason", async () => {
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([processor()], undefined, () =>
          priorityAt({ mode: "fixed", level: 3, reason: "fixed" }),
        )}
        levers={leversStub()}
      />,
    );

    await waitFor(() =>
      expect(view.getByTestId("catch-up-priority").textContent).toBe(
        "Priority 3 · fixed",
      ),
    );
    expect(prioritySelect(view).value).toBe("3");
  });

  it("sets a fixed level or dynamic through the levers, then rereads", async () => {
    let current = priorityAt();
    const levers = leversStub();
    levers.setCatchUpPriority.mockImplementation(
      (setting: { mode: string; level?: number }) => {
        current =
          setting.mode === "fixed"
            ? priorityAt({
                mode: "fixed",
                level: setting.level,
                reason: "fixed",
              })
            : priorityAt({ level: 4, reason: "starting" });
        return Promise.resolve();
      },
    );
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([processor()], undefined, () => current)}
        levers={levers}
      />,
    );
    await waitFor(() => expect(prioritySelect(view).disabled).toBe(false));

    fireEvent.change(prioritySelect(view), { target: { value: "0" } });
    await waitFor(() =>
      expect(view.getByTestId("catch-up-priority").textContent).toBe(
        "Priority 0 · fixed",
      ),
    );
    expect(levers.setCatchUpPriority).toHaveBeenLastCalledWith({
      mode: "fixed",
      level: 0,
    });

    fireEvent.change(prioritySelect(view), { target: { value: "dynamic" } });
    await waitFor(() =>
      expect(view.getByTestId("catch-up-priority").textContent).toBe(
        "Priority 4 · dynamic · starting",
      ),
    );
    expect(levers.setCatchUpPriority).toHaveBeenLastCalledWith({
      mode: "dynamic",
    });
  });

  it("reports a refused setting", async () => {
    const levers = leversStub();
    levers.setCatchUpPriority.mockRejectedValue(new Error("not now"));
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([processor()], undefined, () => priorityAt())}
        levers={levers}
      />,
    );
    await waitFor(() => expect(prioritySelect(view).disabled).toBe(false));

    fireEvent.change(prioritySelect(view), { target: { value: "7" } });

    await waitFor(() =>
      expect(view.getByRole("alert").textContent).toBe(
        "Setting the catch-up priority failed: not now",
      ),
    );
  });

  it("disables the control without levers, with the gate's reason", async () => {
    const view = render(
      <ProcessorsTab
        admin={{ enabled: false, reason: "no levers here" }}
        inspector={inspectorOf([processor()], undefined, () => priorityAt())}
      />,
    );

    await waitFor(() => view.getByTestId("catch-up-priority"));
    expect(prioritySelect(view).disabled).toBe(true);
    expect(
      view
        .getByText("Catch-up priority", { exact: false })
        .getAttribute("title"),
    ).toBe("no levers here");
  });

  it("shows no status where the priority cannot be read", async () => {
    const view = render(
      <ProcessorsTab
        inspector={inspectorOf([processor()])}
        levers={leversStub()}
      />,
    );
    await loaded(view, "factory:drive:0");

    expect(view.queryByTestId("catch-up-priority")).toBeNull();
    expect(prioritySelect(view).disabled).toBe(true);
  });
});
