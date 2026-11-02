// @vitest-environment happy-dom

import type * as ConnectRuntime from "@powerhousedao/connect-core/runtime";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addDrive: vi.fn(),
  closePHModal: vi.fn(),
  showPHModal: vi.fn(),
  setSelectedDrive: vi.fn(),
  toast: vi.fn(),
  client: undefined as { newDrives?: string } | undefined,
  blocked: undefined as Error | undefined,
}));

// Stands in for the design-system dialog's submit.
vi.mock("@powerhousedao/design-system/connect", () => ({
  AddDriveModal: ({
    open,
    onAddLocalDrive,
  }: {
    open: boolean;
    onAddLocalDrive: (data: unknown) => void;
  }) =>
    open ? (
      <button
        onClick={() =>
          onAddLocalDrive({
            id: "app",
            name: "Shared",
            availableOffline: false,
            sharingType: "PUBLIC",
          })
        }
      >
        Create new drive
      </button>
    ) : null,
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  addDrive: mocks.addDrive,
  addRemoteDrive: vi.fn(),
  closePHModal: mocks.closePHModal,
  extractDriveSlugFromPath: vi.fn(),
  fetchDriveInfo: vi.fn(),
  getFullReactorClient: () => mocks.client,
  getDrives: vi.fn(),
  getPHNavigation: vi.fn(),
  getPHStore: vi.fn(),
  setSelectedDrive: mocks.setSelectedDrive,
  showPHModal: mocks.showPHModal,
  useAppModules: () => [{ config: { id: "app" } }],
  usePHModal: () => ({ type: "addDrive" }),
  useVetraPackages: () => [],
  waitForDocumentReady: vi.fn(),
}));

vi.mock("@powerhousedao/connect/services", () => ({ toast: mocks.toast }));

vi.mock("@powerhousedao/connect-core/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectRuntime>()),
  newDrivesBlocked: () => mocks.blocked,
}));

vi.mock("../pages/create-drive-app-options.js", () => ({
  getCreateDriveAppOptions: () => [],
}));

import { AddDriveModal } from "./AddDriveModal.js";

async function submit(): Promise<void> {
  render(<AddDriveModal />);
  fireEvent.click(screen.getByRole("button", { name: "Create new drive" }));
  await waitFor(() => expect(mocks.closePHModal).toHaveBeenCalled());
}

describe("AddDriveModal, new drives on a switchboard", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const mock of [
      mocks.addDrive,
      mocks.closePHModal,
      mocks.showPHModal,
      mocks.setSelectedDrive,
      mocks.toast,
    ]) {
      mock.mockReset();
    }
    mocks.client = { newDrives: "sb" };
    mocks.blocked = undefined;
  });

  it("refuses to create a drive while a ?reactorClient override keeps the reactor here", async () => {
    mocks.client = undefined;
    mocks.blocked = new Error(
      "New drives go to sb, but this browser is set to keep its reactor to itself (?reactorClient=in-process).",
    );

    await submit();

    expect(mocks.addDrive).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      "New drives go to sb, but this browser is set to keep its reactor to itself (?reactorClient=in-process).",
      { type: "connect-warning" },
    );
  });

  it("names the switchboard when it isn't answering", async () => {
    mocks.addDrive.mockRejectedValue(
      Object.assign(new Error("unreachable"), {
        name: "SwitchboardUnreachableError",
      }),
    );

    await submit();

    expect(mocks.addDrive).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledWith(
      "sb isn't answering, so the drive wasn't created.",
      { type: "connect-warning" },
    );
    expect(mocks.setSelectedDrive).not.toHaveBeenCalled();
  });

  it("names the switchboard and its reason when it refuses", async () => {
    mocks.addDrive.mockRejectedValue(
      Object.assign(new Error("refused"), {
        response: {
          status: 200,
          errors: [{ message: "Drives are read-only" }],
        },
      }),
    );

    await submit();

    expect(mocks.toast).toHaveBeenCalledWith(
      "sb refused the new drive: Drives are read-only",
      { type: "connect-warning" },
    );
  });

  it("asks to sign in, after closing the dialog, when the switchboard refuses the caller", async () => {
    mocks.addDrive.mockRejectedValue(
      Object.assign(new Error("unauthorized"), { response: { status: 401 } }),
    );

    await submit();

    await waitFor(() =>
      expect(mocks.showPHModal).toHaveBeenCalledWith({
        type: "driveAuthRequired",
      }),
    );
    expect(mocks.closePHModal.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.showPHModal.mock.invocationCallOrder[0],
    );
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
