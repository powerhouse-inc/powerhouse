// @vitest-environment happy-dom
import { ChannelScheme } from "@powerhousedao/reactor";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import { App, INSPECTOR_TABS } from "./App.js";
import type { ProvisionRequest } from "./components/ProvisionPanel.js";

// Provisioning a reactor stands up a whole PGlite (WASM cold boot plus the
// reactor migrations), which outlasts waitFor's 1s default on a loaded
// machine — see packages/reactor-monitor's own tests for the same allowance.
const WAIT = { timeout: 30_000 } as const;

// The real descriptor builder defaults in-process reactors to `idb://`
// storage, which needs a real browser's IndexedDB; happy-dom has none. Force
// an ephemeral in-memory PGlite instead, matching
// packages/reactor-monitor's own test convention.
function testDescriptor({ name, kind }: ProvisionRequest): ReactorDescriptor {
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

  /**
   * The SWITCHBOARD row of the capability contract, as the Sync tab's two
   * gates read it. Such a reactor's `GqlResponseChannelFactory` serves
   * "polling" channels, which a PEER creates by polling this reactor, so the
   * add-remote form has nothing to create and stays hidden -- while the local
   * channel the builder composes on is as real as on any other scheme, so the
   * link panel is live rather than showing the island refusal.
   */
  it("hides the gql add-remote form on a switchboard-scheme reactor but keeps local links", async () => {
    const view = render(
      <App
        buildDescriptor={({ name, kind }) => ({
          kind,
          name,
          storage: { kind: "memory" },
          sync: { channelScheme: ChannelScheme.SWITCHBOARD },
        })}
      />,
    );

    fireEvent.change(view.getByPlaceholderText("alpha"), {
      target: { value: "switchboard-reactor" },
    });
    fireEvent.click(view.getByRole("button", { name: "Provision" }));

    await waitFor(() => expect(view.getByTitle("ready")).toBeTruthy(), WAIT);
    fireEvent.click(view.getByRole("button", { name: "Sync" }));

    await waitFor(
      () =>
        expect(
          view.getByTestId("sync-add-remote-unavailable").textContent,
        ).toMatch(/does not declare the "gql" sync channel/),
      WAIT,
    );
    // The local end is capable, so the panel asks for a peer instead of
    // explaining why it can never have one.
    expect(view.queryByTestId("link-local-sync-unavailable")).toBeNull();
    expect(
      view.getByText(/Provision another ready local-capable reactor/),
    ).toBeTruthy();
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
