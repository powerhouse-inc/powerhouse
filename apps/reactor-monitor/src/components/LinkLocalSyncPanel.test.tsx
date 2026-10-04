// @vitest-environment happy-dom
import type {
  ManagedReactorEntry,
  ReactorMonitorRegistry,
  ReactorSyncChannel,
} from "@powerhousedao/reactor-monitor";
import { ReactorMonitorProvider } from "@powerhousedao/reactor-monitor/react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LinkLocalSyncPanel } from "./LinkLocalSyncPanel.js";

/**
 * A ready entry carrying only the fields the panel reads. `syncChannels` is
 * one of them: the panel offers only local-capable peers as targets.
 */
function readyEntry(
  name: string,
  syncChannels: readonly ReactorSyncChannel[] = ["gql", "local"],
): ManagedReactorEntry {
  return {
    name,
    descriptor: { kind: "in-process", name },
    status: "ready",
    reactor: {
      name,
      capabilities: { syncChannels },
    } as unknown as ManagedReactorEntry["reactor"],
  } as ManagedReactorEntry;
}

/**
 * A registry stand-in satisfying the hooks (subscribe/getSnapshot) and the
 * provider's reconcile effect (list/get/kill), with a spy on linkLocalSync.
 * `get` returns truthy so the effect treats the declared names as already
 * provisioned and never boots a real reactor.
 */
function fakeRegistry(entries: ManagedReactorEntry[]) {
  const linkLocalSync = vi.fn(() =>
    Promise.resolve({
      reactorA: "a",
      reactorB: "b",
      channelName: "drive-x:main",
      collectionId: {} as never,
      remoteNameA: "local:b:drive-x:main",
      remoteNameB: "local:a:drive-x:main",
      unlink: () => Promise.resolve(),
    }),
  );
  const registry = {
    subscribe: () => () => {},
    getSnapshot: () => entries,
    list: () => entries,
    get: (name: string) => entries.find((e) => e.name === name),
    reactor: (name: string) => entries.find((e) => e.name === name)?.reactor,
    kill: () => Promise.resolve(),
    provision: () => Promise.reject(new Error("not provisioned in this test")),
    linkLocalSync,
  };
  return {
    registry: registry as unknown as ReactorMonitorRegistry,
    linkLocalSync,
  };
}

function renderInProvider(
  registry: ReactorMonitorRegistry,
  node: ReactNode,
): ReturnType<typeof render> {
  return render(
    createElement(
      ReactorMonitorProvider,
      // Declare both names so the reconcile effect treats them as wanted and
      // never kills or re-provisions.
      {
        registry,
        descriptors: [
          { kind: "in-process", name: "a" },
          { kind: "in-process", name: "b" },
        ],
      },
      node,
    ),
  );
}

describe("LinkLocalSyncPanel", () => {
  it("prompts for a peer when none is available", () => {
    const { registry } = fakeRegistry([readyEntry("a")]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { localLinks: true, reactorName: "a" }),
    );

    expect(view.getByTestId("link-local-sync")).toBeTruthy();
    expect(
      view.getByText(/Provision another ready local-capable reactor/),
    ).toBeTruthy();
  });

  // A connect-mode reactor is a valid end of a local link since W3.0, so the
  // panel must offer it; only an island (no sync module) is refused.
  it("offers a connect-mode peer as a target but not an island", () => {
    const { registry } = fakeRegistry([
      readyEntry("a"),
      readyEntry("b", ["gql", "local"]),
      readyEntry("island", []),
    ]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { localLinks: true, reactorName: "a" }),
    );

    const options = view
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(options).toEqual(["", "b"]);
  });

  it("says why an island cannot be linked at all", () => {
    const { registry } = fakeRegistry([readyEntry("a", []), readyEntry("b")]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, {
        localLinks: false,
        reactorName: "a",
      }),
    );

    expect(view.getByTestId("link-local-sync-unavailable")).toBeTruthy();
    expect(view.queryByRole("combobox")).toBeNull();
  });

  it("brokers a link to the selected peer for the given drive", async () => {
    const { registry, linkLocalSync } = fakeRegistry([
      readyEntry("a"),
      readyEntry("b"),
    ]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { localLinks: true, reactorName: "a" }),
    );

    fireEvent.change(view.getByRole("combobox"), { target: { value: "b" } });
    fireEvent.change(view.getByPlaceholderText("drive id to sync"), {
      target: { value: "drive-x" },
    });
    fireEvent.click(view.getByRole("button", { name: "Link local sync" }));

    await waitFor(() =>
      expect(linkLocalSync).toHaveBeenCalledWith("a", "b", {
        driveId: "drive-x",
      }),
    );
    await waitFor(() =>
      expect(view.getByTestId("link-local-sync-ok")).toBeTruthy(),
    );
  });

  it("surfaces a link failure", async () => {
    const { registry, linkLocalSync } = fakeRegistry([
      readyEntry("a"),
      readyEntry("b"),
    ]);
    linkLocalSync.mockRejectedValueOnce(
      new Error("not provisioned with local sync"),
    );
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { localLinks: true, reactorName: "a" }),
    );

    fireEvent.change(view.getByRole("combobox"), { target: { value: "b" } });
    fireEvent.change(view.getByPlaceholderText("drive id to sync"), {
      target: { value: "drive-x" },
    });
    fireEvent.click(view.getByRole("button", { name: "Link local sync" }));

    const error = await view.findByTestId("link-local-sync-error");
    expect(error.textContent).toMatch(/not provisioned with local sync/);
  });

  // A dotted drive id does not survive the collection id key, so the peer would
  // sync a different collection; refuse it before brokering anything.
  it("refuses a dotted drive id without calling the broker", async () => {
    const { registry, linkLocalSync } = fakeRegistry([
      readyEntry("a"),
      readyEntry("b"),
    ]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { localLinks: true, reactorName: "a" }),
    );

    fireEvent.change(view.getByRole("combobox"), { target: { value: "b" } });
    fireEvent.change(view.getByPlaceholderText("drive id to sync"), {
      target: { value: "drive.x" },
    });
    fireEvent.click(view.getByRole("button", { name: "Link local sync" }));

    const error = await view.findByTestId("link-local-sync-error");
    expect(error.textContent).toMatch(/cannot contain a "\."/);
    expect(linkLocalSync).not.toHaveBeenCalled();
  });
});
