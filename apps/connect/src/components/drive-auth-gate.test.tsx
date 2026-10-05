// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as UseDriveAuthGateModule from "../components/use-drive-auth-gate.js";

// Controls useDriveAuthGate's return between tests.
const mockGate = vi.hoisted(() => ({
  gate: null as "login" | "unauthorized" | null,
  dismiss: vi.fn(),
}));

const mockDrives = vi.hoisted(() => ({
  drives: [] as Array<{
    header: { id: string; name: string };
    state: { global: { name: string } };
  }>,
}));

// Only the gate decision is stubbed; `useVisibleDrives` and the hidden-drive
// store stay real so the home screen filters for real.
vi.mock("../components/use-drive-auth-gate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof UseDriveAuthGateModule>()),
  useDriveAuthGate: () => mockGate,
}));

// The real gate lives in design-system; stub it (with the real copy) plus the
// home-screen exports so rendering Content needs no design-system barrel.
vi.mock("@powerhousedao/design-system/connect", () => ({
  DriveAuthGate: ({ onClose }: { onClose?: () => void }) => (
    <div>
      Log in to access this drive
      {onClose ? <button aria-label="Close" onClick={onClose} /> : null}
    </div>
  ),
  HomeScreen: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="home-screen">{children}</div>
  ),
  HomeScreenAddDriveItem: () => null,
  HomeScreenItem: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@powerhousedao/connect/components", () => ({
  AppContainer: () => <div data-testid="app-container" />,
  DriveIcon: () => null,
}));

vi.mock("@powerhousedao/connect/config", () => ({
  defaultPHAppConfig: {},
  defaultPHDocumentEditorConfig: {},
}));

vi.mock("../runtime-config.js", () => ({
  getRuntimeConfig: () => ({ connect: {} }),
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  openRenown: vi.fn(),
  setPHAppConfig: vi.fn(),
  setPHDocumentEditorConfig: vi.fn(),
  setSelectedDrive: vi.fn(),
  useAppModuleById: () => undefined,
  useDrives: () => mockDrives.drives,
  useIsAddDriveEnabled: () => false,
  useRenownAuth: () => ({ login: vi.fn(), pending: false, error: undefined }),
  useRenownLoginMethods: () => [],
  useSelectedDocumentId: () => undefined,
  useSelectedDriveSafe: () => [undefined],
  useSelectedFolder: () => undefined,
}));

import { Content } from "../pages/content.js";
import {
  clearHiddenDrives,
  hideDriveForSession,
} from "../components/use-drive-auth-gate.js";

describe("Content drive auth gate wiring", () => {
  beforeEach(() => {
    mockGate.gate = null;
    mockGate.dismiss.mockClear();
    mockDrives.drives = [];
    clearHiddenDrives();
  });

  it("renders the login gate when gate is 'login'", () => {
    mockGate.gate = "login";
    render(<Content />);
    expect(screen.getByText("Log in to access this drive")).toBeDefined();
    expect(screen.queryByTestId("home-screen")).toBeNull();
  });

  it("renders the home screen (not the gate) when gate is null", () => {
    mockGate.gate = null;
    render(<Content />);
    expect(screen.queryByText("Log in to access this drive")).toBeNull();
    expect(screen.getByTestId("home-screen")).toBeDefined();
  });

  it("gives the full-page gate a close control wired to dismiss", () => {
    mockGate.gate = "login";
    render(<Content />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mockGate.dismiss).toHaveBeenCalledOnce();
  });

  it("drops a dismissed drive from the home screen and keeps Connect usable", () => {
    mockDrives.drives = [
      {
        header: { id: "drive-refused", name: "Refused drive" },
        state: { global: { name: "Refused drive" } },
      },
      {
        header: { id: "drive-healthy", name: "Healthy drive" },
        state: { global: { name: "Healthy drive" } },
      },
    ];
    render(<Content />);
    expect(screen.getByText("Refused drive")).toBeDefined();

    act(() => {
      hideDriveForSession("drive-refused");
    });

    expect(screen.queryByText("Refused drive")).toBeNull();
    expect(screen.getByText("Healthy drive")).toBeDefined();
    expect(screen.getByTestId("home-screen")).toBeDefined();
  });
});
