import type {
  ErrorRouteComponent,
  RouteComponent,
} from "@tanstack/react-router";
import { Outlet, useRouter } from "@tanstack/react-router";

export type ConnectRouteComponents = {
  /** What every page shares; it renders an `<Outlet />`. */
  root: RouteComponent;
  /** The `_app` layout, e.g. the sidebar; it renders an `<Outlet />`. */
  app?: RouteComponent;
  /** Stays mounted between the home and drive views. */
  content: RouteComponent;
  drivePending?: RouteComponent;
  /** Any route's loader or render error. */
  error?: ErrorRouteComponent;
};

// Open views stay while a navigation loads; the pending view only after this.
export const DRIVE_PENDING_MS = 200;

// The file routes render the app shell's components, which come in router context.
function useShellComponents(): Partial<ConnectRouteComponents> {
  return useRouter().options.context.components ?? {};
}

export function RootView() {
  const { root: Root = Outlet } = useShellComponents();
  return <Root />;
}

export function AppLayoutView() {
  const { app: AppLayout = Outlet } = useShellComponents();
  return <AppLayout />;
}

export function ContentView() {
  const { content: Content = Outlet } = useShellComponents();
  return <Content />;
}

export function DrivePendingView() {
  const { drivePending: DrivePending } = useShellComponents();
  return DrivePending ? <DrivePending /> : null;
}
