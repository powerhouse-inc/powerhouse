// @vitest-environment happy-dom
import type {
  InspectorDriveInfo,
  InspectorDriveIntegrity,
  Remote,
} from "@powerhousedao/reactor";
import type {
  MonitorInspector,
  MonitorSyncManager,
} from "@powerhousedao/reactor-monitor";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DrivesTab } from "./DrivesTab.js";

/**
 * The Drives tab lists a reactor's collections with their remote URL, state
 * summary and node counts, and runs an on-demand integrity check. It reads the
 * shared inspection surface, so these stub the inspector and the sync manager
 * directly.
 */
const DRIVE: InspectorDriveInfo = {
  driveId: "drive-a",
  name: "Accounts",
  branch: "main",
  collectionId: "drive.main.drive-a",
  documentType: "powerhouse/document-drive",
  nodeCount: 3,
  fileCount: 2,
  folderCount: 1,
  otherNodeCount: 0,
  unreadableNodeCount: 0,
  icon: undefined,
};

function stubInspector(
  overrides: Partial<
    Pick<MonitorInspector, "listDrives" | "checkDriveIntegrity">
  >,
): MonitorInspector {
  return {
    listDrives: () =>
      Promise.resolve({ results: [DRIVE], nextCursor: undefined }),
    checkDriveIntegrity: () =>
      Promise.resolve<InspectorDriveIntegrity>({
        driveId: "drive-a",
        checkedNodeCount: 2,
        totalFileNodeCount: 2,
        missingDocuments: [],
        unsupportedTypes: [],
      }),
    ...overrides,
  } as unknown as MonitorInspector;
}

function stubSyncManager(
  urls: string | readonly string[] | undefined,
): MonitorSyncManager {
  const list = urls === undefined ? [] : [urls].flat();
  const remotes: Remote[] = list.map(
    (url, index) =>
      ({
        meta: {
          name: `peer-${index}`,
          collectionId: { driveId: "drive-a", branch: "main" },
          channelConfig: { type: "polling", parameters: { url } },
        },
      }) as unknown as Remote,
  );
  return { list: () => remotes } as unknown as MonitorSyncManager;
}

describe("DrivesTab", () => {
  it("lists a drive with its state summary and joined remote URL", async () => {
    const view = render(
      <DrivesTab
        inspector={stubInspector({})}
        syncManager={stubSyncManager("http://peer.example/graphql")}
      />,
    );

    const row = await waitFor(() => view.getByTestId("drives-row"));
    expect(row.textContent).toContain("Accounts");
    expect(row.textContent).toContain("drive.main.drive-a");
    expect(row.textContent).toContain("2 files");
    const url = view.getByTestId("drive-remote-url");
    expect(url.textContent).toContain("http://peer.example/graphql");
  });

  it("shows every remote a drive is synced to, not one as authoritative", async () => {
    const view = render(
      <DrivesTab
        inspector={stubInspector({})}
        syncManager={stubSyncManager([
          "http://peer-a.example/graphql",
          "http://peer-b.example/graphql",
        ])}
      />,
    );

    const url = await waitFor(() => view.getByTestId("drive-remote-url"));
    await waitFor(() => {
      expect(url.textContent).toContain("http://peer-a.example/graphql");
    });
    expect(url.textContent).toContain("http://peer-b.example/graphql");
    expect(url.textContent).toContain("2 remotes");
  });

  it("says a drive with no matching remote is local-only", async () => {
    const view = render(
      <DrivesTab
        inspector={stubInspector({})}
        syncManager={stubSyncManager(undefined)}
      />,
    );

    const url = await waitFor(() => view.getByTestId("drive-remote-url"));
    expect(url.textContent).toContain("none");
  });

  it("runs the integrity check on demand and renders the result", async () => {
    const checkDriveIntegrity = vi.fn(() =>
      Promise.resolve<InspectorDriveIntegrity>({
        driveId: "drive-a",
        checkedNodeCount: 2,
        totalFileNodeCount: 2,
        missingDocuments: [{ id: "doc-x", documentType: "sky/ledger" }],
        unsupportedTypes: [{ id: "doc-y", documentType: "evil/unknown" }],
      }),
    );
    const view = render(
      <DrivesTab
        inspector={stubInspector({ checkDriveIntegrity })}
        syncManager={stubSyncManager(undefined)}
      />,
    );

    const button = await waitFor(() =>
      view.getByRole("button", { name: "Check integrity" }),
    );
    fireEvent.click(button);

    const result = await waitFor(() =>
      view.getByTestId("drive-integrity-result"),
    );
    expect(result.textContent).toContain("doc-x");
    expect(result.textContent).toContain("evil/unknown");
    expect(checkDriveIntegrity).toHaveBeenCalledWith("drive-a", "main");
  });

  it("creates a drive through client.drives.create and re-lists", async () => {
    const listDrives = vi.fn(() =>
      Promise.resolve({ results: [DRIVE], nextCursor: undefined }),
    );
    const create = vi.fn(() => Promise.resolve({} as never));
    const view = render(
      <DrivesTab
        drives={{ create }}
        inspector={stubInspector({ listDrives })}
        syncManager={stubSyncManager(undefined)}
      />,
    );
    await waitFor(() => view.getByTestId("drives-row"));
    const calls = listDrives.mock.calls.length;

    fireEvent.change(view.getByLabelText("Drive name"), {
      target: { value: "Ledger" },
    });
    fireEvent.click(view.getByRole("button", { name: "Create drive" }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({ global: { name: "Ledger" } });
    });
    await waitFor(() => {
      expect(listDrives.mock.calls.length).toBeGreaterThan(calls);
    });
    expect((view.getByLabelText("Drive name") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("shows why a drive cannot be created when it fails", async () => {
    const view = render(
      <DrivesTab
        drives={{ create: () => Promise.reject(new Error("no models")) }}
        inspector={stubInspector({})}
        syncManager={stubSyncManager(undefined)}
      />,
    );

    fireEvent.change(view.getByLabelText("Drive name"), {
      target: { value: "Ledger" },
    });
    fireEvent.click(view.getByRole("button", { name: "Create drive" }));

    const alert = await waitFor(() => view.getByRole("alert"));
    expect(alert.textContent).toContain("no models");
  });

  it("offers no create form without a drive client", async () => {
    const view = render(
      <DrivesTab
        inspector={stubInspector({})}
        syncManager={stubSyncManager(undefined)}
      />,
    );

    await waitFor(() => view.getByTestId("drives-row"));
    expect(view.queryByTestId("drives-create-form")).toBeNull();
    expect(view.getByTestId("drives-create-unavailable")).toBeTruthy();
  });

  it("states plainly when a reactor holds no drives", async () => {
    const view = render(
      <DrivesTab
        inspector={stubInspector({
          listDrives: () =>
            Promise.resolve({ results: [], nextCursor: undefined }),
        })}
        syncManager={stubSyncManager(undefined)}
      />,
    );

    await waitFor(() => {
      expect(view.getByTestId("drives-empty-state")).toBeTruthy();
    });
  });
});
