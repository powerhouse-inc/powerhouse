// @vitest-environment happy-dom
import type {
  ConnectionStateSnapshot,
  IChannel,
  InspectorStorageHealth,
  ISyncAdmin,
  Remote,
  RemoteSyncInspection,
  WireDeadLetter,
  WireDeadLetterPage,
} from "@powerhousedao/reactor";
import { DriveCollectionId, GQL_CHANNEL_TYPE } from "@powerhousedao/reactor";
import type {
  MonitorInspector,
  MonitorSyncManager,
} from "@powerhousedao/reactor-monitor";
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

type FakeSyncManager = MonitorSyncManager & {
  add: ReturnType<typeof vi.fn>;
  triggerPull: ReturnType<typeof vi.fn>;
  inspectRemotes: ReturnType<typeof vi.fn>;
  listDeadLetters: ReturnType<typeof vi.fn>;
};

function fakeSyncManager(
  remotes: Remote[],
  inspections: RemoteSyncInspection[] = [],
  deadLetters: Record<string, WireDeadLetter[]> = {},
): FakeSyncManager {
  const partial = {
    list: () => remotes,
    add: vi.fn(() => Promise.resolve()),
    triggerPull: vi.fn(),
    inspectRemotes: vi.fn(() => Promise.resolve(inspections)),
    listDeadLetters: vi.fn((remoteName: string) =>
      Promise.resolve({
        remoteName,
        results: deadLetters[remoteName] ?? [],
        nextCursor: null,
      } satisfies WireDeadLetterPage),
    ),
  };
  return partial as unknown as FakeSyncManager;
}

type FakeSyncAdmin = ISyncAdmin & {
  resetChannel: ReturnType<typeof vi.fn>;
  requeueDeadLetter: ReturnType<typeof vi.fn>;
  clearDeadLetter: ReturnType<typeof vi.fn>;
};

function fakeSyncAdmin(): FakeSyncAdmin {
  return {
    resetChannel: vi.fn(() => Promise.resolve()),
    requeueDeadLetter: vi.fn(() => Promise.resolve()),
    clearDeadLetter: vi.fn(() => Promise.resolve()),
  };
}

function fakeInspector(health: InspectorStorageHealth): MonitorInspector {
  return {
    getStorageHealth: () => Promise.resolve(health),
  } as unknown as MonitorInspector;
}

function storageHealth(
  overrides: Partial<InspectorStorageHealth>,
): InspectorStorageHealth {
  return {
    tracked: true,
    healthy: true,
    everRecreated: false,
    recreateCount: 0,
    ...overrides,
  };
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
        inspector={fakeInspector(storageHealth({ healthy: false }))}
        gqlRemotes
        syncManager={fakeSyncManager(
          [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
          [inspectionFor("accounts")],
        )}
      />,
    );

    const alert = await view.findByText(/session was reported poisoned/);
    expect(alert).toBeTruthy();
    expect(view.getByTestId("sync-storage-session").textContent).toBe(
      "unhealthy",
    );
  });

  it("shows an untracked store as untracked, without a warning", async () => {
    const view = render(
      <SyncTab
        inspector={fakeInspector(
          storageHealth({ tracked: false, healthy: true }),
        )}
        gqlRemotes
        syncManager={fakeSyncManager([])}
      />,
    );

    const session = await view.findByTestId("sync-storage-session");
    expect(session.textContent).toBe("untracked");
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("requeues and clears dead letters via the repair ops", async () => {
    const deadLetter: WireDeadLetter = {
      id: "dl-1",
      jobId: "job-1",
      documentId: "doc-1",
      scopes: ["global"],
      branch: "main",
      errorMessage: "Document not found",
      errorType: "MISSING_OPERATIONS",
      operationCount: 1,
    };
    const manager = fakeSyncManager(
      [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
      [inspectionFor("accounts")],
      { accounts: [deadLetter] },
    );
    const admin = fakeSyncAdmin();
    const view = render(
      <SyncTab gqlRemotes syncAdmin={admin} syncManager={manager} />,
    );

    const row = await view.findByTestId("sync-dead-letter");
    expect(row.textContent).toMatch(/MISSING_OPERATIONS/);

    fireEvent.click(view.getByText("Requeue"));
    await waitFor(() =>
      expect(admin.requeueDeadLetter).toHaveBeenCalledWith("accounts", "dl-1"),
    );

    fireEvent.click(view.getByText("Clear"));
    await waitFor(() =>
      expect(admin.clearDeadLetter).toHaveBeenCalledWith("accounts", "dl-1"),
    );
  });

  it("resets the channel through the sync admin and re-pulls through the manager", async () => {
    const manager = fakeSyncManager(
      [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
      [inspectionFor("accounts")],
    );
    const admin = fakeSyncAdmin();
    const view = render(
      <SyncTab gqlRemotes syncAdmin={admin} syncManager={manager} />,
    );

    await view.findByTestId("sync-mailbox-depths");
    expect(view.queryByText(/Rewind/)).toBeNull();

    fireEvent.click(view.getByText("Reset channel"));
    await waitFor(() =>
      expect(admin.resetChannel).toHaveBeenCalledWith("accounts"),
    );

    fireEvent.click(view.getByText("Re-pull"));
    expect(manager.triggerPull).toHaveBeenCalledWith("accounts");
  });

  it("disables the repair levers when the reactor serves no sync admin", async () => {
    const deadLetter: WireDeadLetter = {
      id: "dl-1",
      jobId: "job-1",
      documentId: "doc-1",
      scopes: ["global"],
      branch: "main",
      errorMessage: "Document not found",
      errorType: "MISSING_OPERATIONS",
      operationCount: 1,
    };
    const view = render(
      <SyncTab
        gqlRemotes
        syncManager={fakeSyncManager(
          [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
          [inspectionFor("accounts")],
          { accounts: [deadLetter] },
        )}
      />,
    );

    await view.findByTestId("sync-dead-letter");
    expect(view.getByTestId("sync-admin-unavailable")).toBeTruthy();
    for (const name of ["Reset channel", "Requeue", "Clear"]) {
      expect(view.getByRole("button", { name }).hasAttribute("disabled")).toBe(
        true,
      );
    }
    expect(
      view.getByRole("button", { name: "Re-pull" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("offers no lever on a reactor this monitor does not host", async () => {
    const manager = fakeSyncManager(
      [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
      [inspectionFor("accounts")],
    );
    const view = render(
      <SyncTab
        admin={{
          enabled: false,
          reason: "this host's inspection subgraph serves reads only",
        }}
        gqlRemotes
        reconfigurable={false}
        syncManager={manager}
      />,
    );

    await view.findByTestId("sync-mailbox-depths");
    expect(view.getByTestId("admin-gate-note").textContent).toMatch(
      /serves reads only/,
    );
    expect(view.queryByTestId("sync-admin-unavailable")).toBeNull();
    for (const name of ["Reset channel", "Re-pull"]) {
      expect(view.getByRole("button", { name }).hasAttribute("disabled")).toBe(
        true,
      );
    }
    expect(manager.triggerPull).not.toHaveBeenCalled();
  });

  it("surfaces a repair failure instead of swallowing it", async () => {
    const manager = fakeSyncManager(
      [fakeRemote("accounts", HEALTHY_SNAPSHOT)],
      [inspectionFor("accounts")],
    );
    const admin = fakeSyncAdmin();
    admin.resetChannel.mockRejectedValue(new Error("reset exploded"));
    const view = render(
      <SyncTab gqlRemotes syncAdmin={admin} syncManager={manager} />,
    );

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

  // Neither a local-only reactor nor a switchboard-scheme one routes the
  // `{type:"gql"}` config this form writes, so submitting it could only ever
  // produce an error from a factory that will not serve it. The note names
  // both reasons, because the reactor's own channel types are what the gate
  // reads and this form cannot tell which of the two is in front of it.
  it("disables the gql add-remote form when the reactor serves no gql channel and says why", () => {
    const manager = fakeSyncManager([]);
    const view = render(<SyncTab gqlRemotes={false} syncManager={manager} />);

    const note = view.getByTestId("sync-add-remote-unavailable").textContent;
    expect(note).toMatch(/does not declare the "gql" sync channel/);
    expect(note).toMatch(/local-ONLY reactor/);
    expect(note).toMatch(/switchboard-scheme one serves "polling" channels/);
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

  // The config this form writes has to be the type the reactor actually
  // routes, and `gqlRemotes` is a read of that same spelling in the
  // capability contract -- a literal here could drift from the gate that
  // enabled the form, which is exactly the drift the constant removes.
  it("adds the remote under the reactor's own gql channel type", async () => {
    const manager = fakeSyncManager([]);
    const view = render(<SyncTab gqlRemotes syncManager={manager} />);

    fireEvent.change(view.getByLabelText("Remote name"), {
      target: { value: "hub" },
    });
    fireEvent.change(view.getByLabelText("Drive ID"), {
      target: { value: "drive-1" },
    });
    fireEvent.change(view.getByLabelText("GraphQL URL"), {
      target: { value: "https://hub.test/graphql" },
    });
    fireEvent.click(view.getByRole("button", { name: "Add remote" }));

    await waitFor(() => expect(manager.add).toHaveBeenCalled());
    expect(manager.add.mock.calls[0][2]).toEqual({
      type: GQL_CHANNEL_TYPE,
      parameters: { url: "https://hub.test/graphql" },
    });
  });
});
