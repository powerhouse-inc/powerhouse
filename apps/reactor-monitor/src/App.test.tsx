// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import { App, INSPECTOR_TABS } from "./App.js";

// Provisioning a reactor stands up a whole PGlite (WASM cold boot plus the
// reactor migrations), which outlasts waitFor's 1s default on a loaded
// machine — see packages/reactor-monitor's own tests for the same allowance.
const WAIT = { timeout: 30_000 } as const;

// The real descriptor builder defaults in-process reactors to `idb://`
// storage, which needs a real browser's IndexedDB; happy-dom has none. Force
// an ephemeral in-memory PGlite instead, matching
// packages/reactor-monitor's own test convention.
function testDescriptor(
  name: string,
  kind: "worker" | "in-process",
): ReactorDescriptor {
  return { kind, name, storage: { kind: "memory" } };
}

describe("App", () => {
  it("renders the shell with the provision form, reactor list and inspector tabs", () => {
    const { getByRole, getByLabelText, getByText } = render(<App />);

    expect(getByRole("heading", { name: "Reactor Monitor" })).toBeTruthy();
    expect(getByLabelText("Reactor list")).toBeTruthy();
    expect(getByText("No reactors provisioned yet.")).toBeTruthy();
    for (const tab of INSPECTOR_TABS) {
      expect(getByText(tab)).toBeTruthy();
    }
  });

  it("provisions an in-process reactor from the form and shows its queue snapshot", async () => {
    const view = render(<App buildDescriptor={testDescriptor} />);

    fireEvent.change(view.getByPlaceholderText("alpha"), {
      target: { value: "test-reactor" },
    });
    // The kind select already defaults to "in-process".
    fireEvent.click(view.getByRole("button", { name: "Provision" }));

    await waitFor(() => expect(view.getByTitle("ready")).toBeTruthy(), WAIT);

    // The newly provisioned reactor is auto-selected; Overview is the
    // default tab, so switch to Queue.
    fireEvent.click(view.getByRole("button", { name: "Queue" }));

    await waitFor(
      () => expect(view.getByText(/Showing \d+ job\(s\)/)).toBeTruthy(),
      WAIT,
    );
    expect(view.getByText("Running")).toBeTruthy();
  }, 30_000);

  it("kills a provisioned reactor and clears the selection", async () => {
    const view = render(<App buildDescriptor={testDescriptor} />);

    fireEvent.change(view.getByPlaceholderText("alpha"), {
      target: { value: "to-kill" },
    });
    fireEvent.click(view.getByRole("button", { name: "Provision" }));

    await waitFor(() => expect(view.getByTitle("ready")).toBeTruthy(), WAIT);

    fireEvent.click(view.getByRole("button", { name: "Kill" }));

    await waitFor(
      () => expect(view.getByText("No reactors provisioned yet.")).toBeTruthy(),
      WAIT,
    );
    expect(view.getByText("Select a reactor to inspect it.")).toBeTruthy();
  }, 30_000);
});
