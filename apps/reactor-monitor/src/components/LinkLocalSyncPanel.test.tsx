// @vitest-environment happy-dom
import { DriveCollectionId } from "@powerhousedao/reactor";
import {
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  reactorCapabilities,
  type ManagedInProcessReactor,
  type ManagedReactorEntry,
  type ReactorMonitorRegistry,
} from "@powerhousedao/reactor-monitor";
import { ReactorMonitorProvider } from "@powerhousedao/reactor-monitor/react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LinkLocalSyncPanel } from "./LinkLocalSyncPanel.js";

/**
 * A handle member this panel must never touch. A getter rather than an absent
 * field, so a read the fake does not model fails loudly here instead of
 * reaching the panel as `undefined`.
 */
function unused(member: string): never {
  throw new Error(
    `LinkLocalSyncPanel read "${member}", which this fake reactor does not model`,
  );
}

/**
 * A reactor handle with the runtime shape of the real one: the two members the
 * panel reads carry real values (the capability contract comes from
 * `reactorCapabilities` itself, derived from the built channel types), and
 * every other member is present and loud.
 */
function readyReactor(
  name: string,
  syncChannelTypes: readonly string[],
): ManagedInProcessReactor {
  return {
    name,
    kind: "in-process",
    capabilities: reactorCapabilities(
      { kind: "in-process", name, storage: { kind: "memory" } },
      { canSelfHeal: false, syncChannelTypes },
    ),
    syncManager: undefined,
    get client() {
      return unused("client");
    },
    get inspector() {
      return unused("inspector");
    },
    get dbQuery() {
      return unused("dbQuery");
    },
    get events() {
      return unused("events");
    },
    get module() {
      return unused("module");
    },
    kill: () => Promise.resolve(),
    isShutdown: () => false,
  };
}

/**
 * A ready entry. `syncChannelTypes` is what the panel gates on -- for BOTH
 * ends now: it reads this reactor's own entry for its own local capability,
 * and every other entry's for the target list.
 */
function readyEntry(
  name: string,
  syncChannelTypes: readonly string[] = [GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE],
): ManagedReactorEntry {
  return {
    name,
    descriptor: { kind: "in-process", name },
    status: "ready",
    reactor: readyReactor(name, syncChannelTypes),
  };
}

/** An entry that is still booting, so there is no contract to read yet. */
function provisioningEntry(name: string): ManagedReactorEntry {
  return {
    name,
    descriptor: { kind: "in-process", name },
    status: "provisioning",
  };
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
      collectionId: DriveCollectionId.forDrive("drive-x"),
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
      createElement(LinkLocalSyncPanel, { reactorName: "a" }),
    );

    expect(view.getByTestId("link-local-sync")).toBeTruthy();
    expect(
      view.getByText(/Provision another ready local-capable reactor/),
    ).toBeTruthy();
  });

  // A connect-mode reactor is a valid end of a local link since W3.0, so the
  // panel must offer it; only a reactor that does not declare the channel is
  // refused.
  it("offers a connect-mode peer as a target but not an island", () => {
    const { registry } = fakeRegistry([
      readyEntry("a"),
      readyEntry("b", [GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE]),
      readyEntry("island", []),
    ]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { reactorName: "a" }),
    );

    const options = view
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(options).toEqual(["", "b"]);
  });

  // This end's capability comes from the registry the panel already
  // subscribes to, not from a prop: one path to the fact, so there is nothing
  // to disagree with.
  it("reads its own local capability off its own entry", () => {
    const { registry } = fakeRegistry([readyEntry("a", []), readyEntry("b")]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { reactorName: "a" }),
    );

    expect(view.getByTestId("link-local-sync-unavailable")).toBeTruthy();
    expect(view.queryByRole("combobox")).toBeNull();
  });

  it("says why an island cannot be linked at all", () => {
    const { registry } = fakeRegistry([readyEntry("a", []), readyEntry("b")]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { reactorName: "a" }),
    );

    expect(view.getByTestId("link-local-sync-unavailable").textContent).toMatch(
      /built with no sync module/,
    );
  });

  // The other no-local shape, and a different problem: this reactor syncs,
  // it just cannot be handed a MessagePort. Telling its operator to choose a
  // sync mode would be advice for a fault they do not have.
  it("distinguishes a syncing reactor that serves no local channel from an island", () => {
    const { registry } = fakeRegistry([
      readyEntry("a", [GQL_CHANNEL_TYPE]),
      readyEntry("b"),
    ]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { reactorName: "a" }),
    );

    const message = view.getByTestId("link-local-sync-unavailable").textContent;
    expect(message).toMatch(/declares sync channels \[gql\]/);
    expect(message).not.toMatch(/built with no sync module/);
  });

  it("says a booting reactor has no contract to read yet", () => {
    const { registry } = fakeRegistry([
      provisioningEntry("a"),
      readyEntry("b"),
    ]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { reactorName: "a" }),
    );

    expect(view.getByTestId("link-local-sync-unavailable").textContent).toMatch(
      /not ready/,
    );
  });

  it("brokers a link to the selected peer for the given drive", async () => {
    const { registry, linkLocalSync } = fakeRegistry([
      readyEntry("a"),
      readyEntry("b"),
    ]);
    const view = renderInProvider(
      registry,
      createElement(LinkLocalSyncPanel, { reactorName: "a" }),
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
      createElement(LinkLocalSyncPanel, { reactorName: "a" }),
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
      createElement(LinkLocalSyncPanel, { reactorName: "a" }),
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
