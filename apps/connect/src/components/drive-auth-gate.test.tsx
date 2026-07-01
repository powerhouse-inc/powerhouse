// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Controls useDriveAuthGate's return between tests.
const mockGate = vi.hoisted(() => ({
  gate: null as "login" | "unauthorized" | null,
}));

vi.mock("../components/use-drive-auth-gate.js", () => ({
  useDriveAuthGate: () => mockGate,
}));

// The real gate lives in design-system; stub it (with the real copy) plus the
// home-screen exports so rendering Content needs no design-system barrel.
vi.mock("@powerhousedao/design-system/connect", () => ({
  DriveAuthGate: () => <div>Log in to access this drive</div>,
  HomeScreen: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="home-screen">{children}</div>
  ),
  HomeScreenAddDriveItem: () => null,
  HomeScreenItem: () => null,
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
  useDrives: () => [],
  useIsAddDriveEnabled: () => false,
  useSelectedDocumentId: () => undefined,
  useSelectedDriveSafe: () => [undefined],
  useSelectedFolder: () => undefined,
}));

import { Content } from "../pages/content.js";

describe("Content drive auth gate wiring", () => {
  beforeEach(() => {
    mockGate.gate = null;
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
});
