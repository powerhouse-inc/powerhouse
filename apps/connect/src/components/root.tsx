import { Outlet } from "@tanstack/react-router";
import { Suspense } from "react";

/** What every page shares; the sidebar is the `_app` layout's. */
export function Root() {
  return (
    <div className="h-screen overflow-auto bg-background">
      <Suspense name="Root">
        <Outlet />
      </Suspense>
    </div>
  );
}
