// @vitest-environment happy-dom
import type {
  ConnectionStateSnapshot,
  DeadLetterPage,
  DeadLetterRecord,
  IChannel,
  IInspector,
  InspectableSyncManager,
  Remote,
  RemoteSyncInspection,
  StorageHealth,
} from "@powerhousedao/reactor";
import { ChannelErrorSource, DriveCollectionId } from "@powerhousedao/reactor";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

const HEALTHY_SNAPSHOT: ConnectionStateSnapshot = {
  state: "connected",
  failureCount: 0,
  lastSuccessUtcMs: Date.now(),
  lastFailureUtcMs: 0,
  pushBlocked: false,
  pushFailureCount: 0,
  receivingPages: false,
  requiresAuth: false,
};

function inspectionFor(
  name: string,
  overrides: Partial<RemoteSyncInspection> = {},
): RemoteSyncInspection {
  return {
    remoteName: name,
    remoteId: name,
    inboxCursor: {
      cursorType: "inbox",
      cursorOrdinal: 9770,
      lastSyncedAtUtcMs: 1000,
      liveAckOrdinal: 9770,
      liveLatestOrdinal: 9800,
    },
    outboxCursor: {
      cursorType: "outbox",
      cursorOrdinal: 42,
      lastSyncedAtUtcMs: 1001,
      liveAckOrdinal: 42,
      liveLatestOrdinal: 42,
    },
    mailboxDepths: { inbox: 30, outbox: 1, deadLetter: 2 },
    connection: {
      snapshot: HEALTHY_SNAPSHOT,
      neverSucceeded: false,
      stalenessMs: 0,
    },
    ...overrides,
  };
}

type FakeSyncManager = InspectableSyncManager & {
  inspectRemotes: ReturnType<typeof vi.fn>;
  listDeadLetters: ReturnType<typeof vi.fn>;
  requeueDeadLetter: ReturnType<typeof vi.fn>;
  clearDeadLetter: ReturnType<typeof vi.fn>;
  rewindInboxCursor: ReturnType<typeof vi.fn>;
  resetChannel: ReturnType<typeof vi.fn>;
};

function fakeSyncManager(
  remotes: Remote[],
  inspections: RemoteSyncInspection[] = [],
  deadLetters: Record<string, DeadLetterRecord[]> = {},
): FakeSyncManager {
  const partial = {
    list: () => remotes,
    add: () => Promise.reject(new Error("not used in this test")),
    triggerPull: vi.fn(),
    inspectRemotes: vi.fn(() => Promise.resolve(inspections)),
    listDeadLetters: vi.fn((remoteName: string) =>
      Promise.resolve({
        remoteName,
        results: deadLetters[remoteName] ?? [],
        nextCursor: undefined,
      } satisfies DeadLetterPage),
    ),
    rewindInboxCursor: vi.fn(() => Promise.resolve()),
    resetChannel: vi.fn(() => Promise.resolve()),
    requeueDeadLetter: vi.fn(() => Promise.resolve()),
    clearDeadLetter: vi.fn(() => Promise.resolve()),
  };
  return partial as unknown as FakeSyncManager;
}

function fakeInspector(health: StorageHealth): IInspector {
  return {
    getStorageHealth: () => Promise.resolve(health),
  } as unknown as IInspector;
}

describe("SyncTab", () => {
  it("renders the empty state with no remotes configured", () => {
    const view = render(
      <SyncTab gqlRemotes syncManager={fakeSyncManager([])} />,
    );
    expect(view.getByTestId("sync-empty-state")).toBeTruthy();
  });

  it("drives the never-succeeded warning from the first-class inspection flag", async () => {
    // snapshot shows a non-zero last success, so only the first-class
    // `neverSucceeded` flag can be what raises the warning.
    const inspection = inspectionFor("accounts", {
      connection: {
        snapshot: HEALTHY_SNAPSHOT,
        neverSucceeded: true,
        stalenessMs: undefined,
      },
    });
    const view = render(
      <SyncTab
        gqlRemotes
        syncManager={fakeSyncManager(
          [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
          [inspection],
        )}
      />,
    );

    const alert = await view.findByRole("alert");
    expect(alert.textContent).toMatch(/never completed a successful poll/);
  });

  it("does not warn for a healthy connected channel", async () => {
    const view = render(
      <SyncTab
        gqlRemotes
        syncManager={fakeSyncManager(
          [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
          [inspectionFor("accounts")],
        )}
      />,
    );

    await view.findByTestId("sync-mailbox-depths");
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("renders real cursors and mailbox depths from the inspection op", async () => {
    const view = render(
      <SyncTab
        gqlRemotes
        syncManager={fakeSyncManager(
          [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
          [inspectionFor("accounts")],
        )}
      />,
    );

    const depths = await view.findByTestId("sync-mailbox-depths");
    expect(depths.textContent).toMatch(/inbox 30/);
    expect(depths.textContent).toMatch(/dead-letter 2/);
    const inboxCursor = view.getByTestId("sync-inbox-cursor");
    expect(inboxCursor.textContent).toMatch(/stored 9770/);
  });

  it("renders storage health and warns when the session is unhealthy", async () => {
    const view = render(
      <SyncTab
        inspector={fakeInspector({
          healthy: false,
          everRecreated: true,
          recreateCount: 1,
          lastRecreated: { reason: "portal", timestampUtcMs: 1, attempt: 1 },
        })}
        gqlRemotes
        syncManager={fakeSyncManager(
          [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
          [inspectionFor("accounts")],
        )}
      />,
    );

    const alert = await view.findByText(/session was reported poisoned/);
    expect(alert).toBeTruthy();
  });

  it("requeues and clears dead letters via the repair ops", async () => {
    const deadLetter: DeadLetterRecord = {
      id: "dl-1",
      jobId: "job-1",
      jobDependencies: [],
      remoteName: "accounts",
      documentId: "doc-1",
      scopes: ["global"],
      branch: "main",
      operations: [],
      errorSource: ChannelErrorSource.Inbox,
      errorMessage: "Document not found",
      errorType: "MISSING_OPERATIONS",
    };
    const manager = fakeSyncManager(
      [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
      [inspectionFor("accounts")],
      { accounts: [deadLetter] },
    );
    const view = render(<SyncTab gqlRemotes syncManager={manager} />);

    const row = await view.findByTestId("sync-dead-letter");
    expect(row.textContent).toMatch(/MISSING_OPERATIONS/);

    fireEvent.click(view.getByText("Requeue"));
    await waitFor(() =>
      expect(manager.requeueDeadLetter).toHaveBeenCalledWith(
        "accounts",
        "dl-1",
      ),
    );

    fireEvent.click(view.getByText("Clear"));
    await waitFor(() =>
      expect(manager.clearDeadLetter).toHaveBeenCalledWith("accounts", "dl-1"),
    );
  });

  it("rewinds the inbox cursor and resets the channel via repair levers", async () => {
    const manager = fakeSyncManager(
      [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
      [inspectionFor("accounts")],
    );
    const view = render(<SyncTab gqlRemotes syncManager={manager} />);

    await view.findByTestId("sync-mailbox-depths");

    fireEvent.click(view.getByText("Rewind + re-pull"));
    await waitFor(() =>
      expect(manager.rewindInboxCursor).toHaveBeenCalledWith("accounts", 0),
    );

    fireEvent.click(view.getByText("Reset channel"));
    await waitFor(() =>
      expect(manager.resetChannel).toHaveBeenCalledWith("accounts"),
    );
  });

  it("surfaces a repair failure instead of swallowing it", async () => {
    const manager = fakeSyncManager(
      [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
      [inspectionFor("accounts")],
    );
    manager.resetChannel.mockRejectedValue(new Error("reset exploded"));
    const view = render(<SyncTab gqlRemotes syncManager={manager} />);

    await view.findByTestId("sync-mailbox-depths");
    fireEvent.click(view.getByText("Reset channel"));

    const error = await view.findByTestId("sync-repair-error");
    expect(error.textContent).toMatch(/reset exploded/);
  });

  it("skips the dead-letter fetch when the mailbox depth is zero", async () => {
    const manager = fakeSyncManager(
      [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
      [
        inspectionFor("accounts", {
          mailboxDepths: { inbox: 0, outbox: 0, deadLetter: 0 },
        }),
      ],
    );
    const view = render(<SyncTab gqlRemotes syncManager={manager} />);

    await view.findByTestId("sync-mailbox-depths");
    expect(manager.listDeadLetters).not.toHaveBeenCalled();
  });

  it("renders a placeholder when the reactor has no sync module", () => {
    const view = render(<SyncTab gqlRemotes syncManager={undefined} />);
    expect(view.getByText(/no sync module/)).toBeTruthy();
  });

  // A local-only reactor has no gql channel factory, so submitting this form
  // could only ever produce an error from a factory that will not serve it.
  it("disables the gql add-remote form on a local-only reactor and says why", () => {
    const manager = fakeSyncManager([]);
    const view = render(<SyncTab gqlRemotes={false} syncManager={manager} />);

    expect(view.getByTestId("sync-add-remote-unavailable").textContent).toMatch(
      /provisioned local-only/,
    );
    expect(
      view.getByRole("button", { name: "Add remote" }).hasAttribute("disabled"),
    ).toBe(true);
    for (const label of ["Remote name", "Drive ID", "GraphQL URL"]) {
      expect((view.getByLabelText(label) as HTMLInputElement).disabled).toBe(
        true,
      );
    }
  });

  // Connect mode now ALSO serves brokered local peers (W3.0), so the gating
  // is on the gql channel alone: the form stays live on a reactor that can do
  // both, which the earlier "local means no gql form" reading got backwards.
  it("leaves the add-remote form usable on a connect reactor", () => {
    const view = render(
      <SyncTab gqlRemotes syncManager={fakeSyncManager([])} />,
    );

    expect(view.queryByTestId("sync-add-remote-unavailable")).toBeNull();
    expect(
      view.getByRole("button", { name: "Add remote" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});
