import { useBackendAuthGate } from "@powerhousedao/connect-core/runtime";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useReleasePrerenderedShell } from "./prerendered-shell.js";

// Loaded only when a backend refused the caller: it lives with core's views,
// which the pages otherwise load lazily.
const BackendAuthGate = lazy(() =>
  import("@powerhousedao/connect-core/views").then((m) => ({
    default: m.BackendAuthGate,
  })),
);

/** What every page shares; the sidebar is the `_app` layout's. */
export function Root() {
  // Not on mount: the first route's chunks may still be loading under the shell.
  const routed = useRouterState({
    select: (state) => !!state.resolvedLocation && state.status === "idle",
  });
  useReleasePrerenderedShell(routed);
  // The backend refused this caller: the sign-in gate takes the place of the
  // routes (a host's own shell included) until the caller is one it accepts.
  const gate = useBackendAuthGate();
  return (
    <div className="h-screen overflow-auto bg-background text-foreground">
      <Suspense name="Root">
        {gate ? <BackendAuthGate mode={gate} /> : <Outlet />}
      </Suspense>
    </div>
  );
}
