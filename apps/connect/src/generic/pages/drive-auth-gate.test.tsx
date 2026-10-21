// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as UseDriveAuthGateModule from "./use-drive-auth-gate.js";

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
vi.mock("./use-drive-auth-gate.js", async (importOriginal) => ({
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

vi.mock("../editors/app-container.js", () => ({
  AppContainer: () => <div data-testid="app-container" />,
}));
vi.mock("../editors/document-editor-container.js", () => ({
  DocumentEditorContainer: () => null,
}));
vi.mock("@powerhousedao/connect/components/shared", () => ({
  DriveIcon: () => null,
}));

vi.mock("@powerhousedao/connect/config", () => ({
  defaultPHAppConfig: {},
  defaultPHDocumentEditorConfig: {},
}));

vi.mock("@powerhousedao/connect-core/runtime-config", () => ({
  getRuntimeConfig: () => ({ connect: {} }),
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  FEATURE_FLAG_PARAM_PREFIX: "FEATURE_",
  GLOBAL_SEARCH_PARAMS: [],
  OPENED_FROM_STATE_KEY: "phOpenedFrom",
  SETTINGS_PATH: "/settings",
  openRenown: vi.fn(),
  setPHAppConfig: vi.fn(),
  setPHDocumentEditorConfig: vi.fn(),
  setSelectedDrive: vi.fn(),
  useAppModuleById: () => undefined,
  useDrives: () => mockDrives.drives,
  useIsAddDriveEnabled: () => false,
  makeDriveSlug: (drive: { header: { slug: string } }) => drive.header.slug,
  getDriveName: (drive: {
    header: { name: string };
    state: { global: { name: string } };
  }) => drive.header.name || drive.state.global.name,
  useLinkProps: () => ({ href: "/", onClick: vi.fn() }),
  useRenownAuth: () => ({ login: vi.fn(), pending: false, error: undefined }),
  useRenownLoginMethods: () => [],
  usePHStore: () => undefined,
  getPHStore: () => undefined,
  PHStoreProvider: ({ children }: { children?: React.ReactNode }) => children,
  useSelectedDocumentId: () => undefined,
  useSelectedDriveSafe: () => [undefined],
  useSelectedFolder: () => undefined,
}));

import { DriveLayout, Home } from "./content.js";

// Home at `/` and the drive layout at `/d`, as Connect's routes render them.
async function renderContent(path = "/") {
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: Home,
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/d",
        component: DriveLayout,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}
import {
  clearHiddenDrives,
  hideDriveForSession,
} from "./use-drive-auth-gate.js";

describe("Drive auth gate wiring", () => {
  beforeEach(() => {
    mockGate.gate = null;
    mockGate.dismiss.mockClear();
    mockDrives.drives = [];
    clearHiddenDrives();
  });

  it("renders the login gate when gate is 'login'", async () => {
    mockGate.gate = "login";
    await renderContent("/d");
    expect(screen.getByText("Log in to access this drive")).toBeDefined();
    expect(screen.queryByTestId("app-container")).toBeNull();
  });

  it("renders the drive app (not the gate) when gate is null", async () => {
    mockGate.gate = null;
    await renderContent("/d");
    expect(screen.queryByText("Log in to access this drive")).toBeNull();
    expect(screen.getByTestId("app-container")).toBeDefined();
  });

  it("gives the full-page gate a close control wired to dismiss", async () => {
    mockGate.gate = "login";
    await renderContent("/d");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mockGate.dismiss).toHaveBeenCalledOnce();
  });

  it("drops a dismissed drive from the home screen and keeps Connect usable", async () => {
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
    await renderContent();
    expect(screen.getByText("Refused drive")).toBeDefined();

    act(() => {
      hideDriveForSession("drive-refused");
    });

    expect(screen.queryByText("Refused drive")).toBeNull();
    expect(screen.getByText("Healthy drive")).toBeDefined();
    expect(screen.getByTestId("home-screen")).toBeDefined();
  });
});
