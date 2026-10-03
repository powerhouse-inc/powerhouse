// @vitest-environment happy-dom
import type {
  ConnectionStateSnapshot,
  IChannel,
  ISyncManager,
  Remote,
} from "@powerhousedao/reactor";
import { DriveCollectionId } from "@powerhousedao/reactor";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SyncTab } from "./SyncTab.js";

function fakeChannel(snapshot: ConnectionStateSnapshot): IChannel {
  return {
    inbox: undefined,
    outbox: undefined,
    deadLetter: undefined,
    init: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
    getConnectionState: () => snapshot,
    onConnectionStateChange: () => () => {},
    triggerPull: () => {},
    notePoll: () => {},
    lastHolderPollUtcMs: () => undefined,
  } as unknown as IChannel;
}

function fakeRemote(name: string, snapshot: ConnectionStateSnapshot): Remote {
  return {
    meta: {
      id: name,
      name,
      collectionId: DriveCollectionId.forDrive("some-drive"),
      channelConfig: {
        type: "gql",
        parameters: { url: "https://example.test/graphql" },
      },
      filter: { documentId: [], scope: [], branch: "main" },
      options: {},
    },
    channel: fakeChannel(snapshot),
  };
}

function fakeSyncManager(remotes: Remote[]): ISyncManager {
  return {
    list: () => remotes,
    add: () => Promise.reject(new Error("not used in this test")),
    triggerPull: () => {},
  } as unknown as ISyncManager;
}

const CONNECTED_NEVER_SUCCEEDED: ConnectionStateSnapshot = {
  state: "connected",
  failureCount: 0,
  lastSuccessUtcMs: 0,
  lastFailureUtcMs: 0,
  pushBlocked: false,
  pushFailureCount: 0,
  receivingPages: false,
  requiresAuth: false,
};

const HEALTHY: ConnectionStateSnapshot = {
  ...CONNECTED_NEVER_SUCCEEDED,
  lastSuccessUtcMs: Date.now(),
};

describe("SyncTab", () => {
  it("renders the empty state with no remotes configured", () => {
    const view = render(<SyncTab syncManager={fakeSyncManager([])} />);

    expect(view.getByTestId("sync-empty-state")).toBeTruthy();
  });

  it("renders a prominent warning for a channel reporting connected with zero successful polls", () => {
    const view = render(
      <SyncTab
        syncManager={fakeSyncManager([
          fakeRemote("accounts", CONNECTED_NEVER_SUCCEEDED),
        ])}
      />,
    );

    const alert = view.getByRole("alert");
    expect(alert.textContent).toMatch(/never completed a successful poll/);
  });

  it("does not warn for a healthy connected channel", () => {
    const view = render(
      <SyncTab
        syncManager={fakeSyncManager([fakeRemote("accounts", HEALTHY)])}
      />,
    );

    expect(view.queryByRole("alert")).toBeNull();
  });

  it("renders a placeholder when the reactor has no sync module", () => {
    const view = render(<SyncTab syncManager={undefined} />);

    expect(view.getByText(/no sync module/)).toBeTruthy();
  });
});
