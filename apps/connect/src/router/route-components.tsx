import type {
  ErrorRouteComponent,
  RouteComponent,
} from "@tanstack/react-router";
import { HeadContent, Outlet, useRouter } from "@tanstack/react-router";
import type { ComponentType } from "react";

export type ConnectRouteComponents = {
  /** What every page shares; it renders an `<Outlet />`. */
  root: RouteComponent;
  /** The `_app` layout, e.g. the sidebar; it renders an `<Outlet />`. */
  app?: RouteComponent;
  /** Stays mounted between the home and drive views. */
  content: RouteComponent;
  /** Unknown paths and loaders' notFound(), inside the layout. */
  notFound?: RouteComponent;
  drivePending?: RouteComponent;
  /** A drive that is not listed once arrivals settle; `notFound` without it. */
  driveNotFound?: ComponentType<{ driveSlug: string }>;
  /** Any route's loader or render error. */
  error?: ErrorRouteComponent;
  /** The settings page around its tabs; it renders an `<Outlet />`. */
  settings?: RouteComponent;
  /** Connect's own settings tabs; one left out is not listed. */
  settingsTabs?: Partial<Record<CoreSettingsTabId, RouteComponent>>;
};

export type CoreSettingsTabId =
  | "ai-assistant"
  | "package-manager"
  | "default-editors"
  | "danger-zone"
  | "about";

// Open views stay while a navigation loads; the pending view only after this.
export const DRIVE_PENDING_MS = 200;

// The file routes render the app shell's components, which come in router context.
function useShellComponents(): Partial<ConnectRouteComponents> {
  return useRouter().options.context.components ?? {};
}

export function RootView() {
  const { root: Root = Outlet } = useShellComponents();
  return (
    <>
      {/* The matched routes' head: the document title. */}
      <HeadContent />
      <Root />
    </>
  );
}

export function AppLayoutView() {
  const { app: AppLayout = Outlet } = useShellComponents();
  return <AppLayout />;
}

export function ContentView() {
  const { content: Content = Outlet } = useShellComponents();
  return <Content />;
}

export function NotFoundView() {
  const { notFound: NotFound } = useShellComponents();
  return NotFound ? <NotFound /> : null;
}

export function DrivePendingView() {
  const { drivePending: DrivePending } = useShellComponents();
  return DrivePending ? <DrivePending /> : null;
}

export function DriveNotFoundView({ driveSlug }: { driveSlug: string }) {
  const { driveNotFound: DriveNotFound, notFound: NotFound } =
    useShellComponents();
  if (DriveNotFound) return <DriveNotFound driveSlug={driveSlug} />;
  return NotFound ? <NotFound /> : null;
}

export function SettingsView() {
  const { settings: Settings = Outlet } = useShellComponents();
  return <Settings />;
}

/** A core settings tab's view: the shell's component for `id`. */
export function shellSettingsTab(id: CoreSettingsTabId) {
  return function SettingsTabView() {
    const Tab = useShellComponents().settingsTabs?.[id];
    return Tab ? <Tab /> : null;
  };
}

/** A core tab is listed only when the shell provides it. */
export function shellProvidesTab(id: CoreSettingsTabId) {
  return (context: { components?: ConnectRouteComponents }) =>
    !!context.components?.settingsTabs?.[id];
}
