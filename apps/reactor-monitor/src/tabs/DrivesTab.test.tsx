// @vitest-environment happy-dom
import type {
  IInspector,
  InspectableSyncManager,
  InspectorDriveInfo,
  InspectorDriveIntegrity,
  Remote,
} from "@powerhousedao/reactor";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DrivesTab } from "./DrivesTab.js";

/**
 * The Drives tab lists a reactor's collections with their remote URL, state
 * summary and node counts, and runs an on-demand integrity check (multi-reactor
 * §1). It reads the shared inspection surface, so these stub the inspector and
 * the sync manager directly.
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
  icon: undefined,
};

function stubInspector(
  overrides: Partial<Pick<IInspector, "listDrives" | "checkDriveIntegrity">>,
): IInspector {
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
        nextCursor: undefined,
      }),
    ...overrides,
  } as unknown as IInspector;
}

function stubSyncManager(url: string | undefined): InspectableSyncManager {
  const remotes: Remote[] = url
    ? ([
        {
          meta: {
            name: "peer",
            collectionId: { driveId: "drive-a", branch: "main" },
            channelConfig: { type: "polling", parameters: { url } },
          },
        },
      ] as unknown as Remote[])
    : [];
  return { list: () => remotes } as unknown as InspectableSyncManager;
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
        nextCursor: undefined,
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
    expect(checkDriveIntegrity).toHaveBeenCalledWith(
      "drive-a",
      undefined,
      undefined,
    );
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
