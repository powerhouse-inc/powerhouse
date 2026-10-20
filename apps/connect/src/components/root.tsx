import { Outlet, useRouterState } from "@tanstack/react-router";
import { Suspense } from "react";
import { useReleasePrerenderedShell } from "./prerendered-shell.js";

/** What every page shares; the sidebar is the `_app` layout's. */
export function Root() {
  // Not on mount: the first route's chunks may still be loading under the shell.
  const routed = useRouterState({
    select: (state) => !!state.resolvedLocation && state.status === "idle",
  });
  useReleasePrerenderedShell(routed);
  return (
    <div className="h-screen overflow-auto bg-background text-foreground">
      <Suspense name="Root">
        <Outlet />
      </Suspense>
    </div>
  );
}
