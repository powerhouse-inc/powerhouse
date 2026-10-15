import { IfPlugin, Sidebar } from "@powerhousedao/connect/components";
import { useIsEmbedded } from "@powerhousedao/connect/hooks";
import { Suspense } from "react";
import { Outlet } from "react-router-dom";

/** The generic shell's module id; the sidebar is its most visible surface. */
const GENERIC_PLUGIN = "@powerhousedao/connect/plugins/generic";

export function Root() {
  const isEmbedded = useIsEmbedded();
  return (
    <div className="h-screen bg-background">
      <div
        className={`flex h-screen items-stretch overflow-auto`}
        role="presentation"
        tabIndex={0}
      >
        <Suspense name="Root">
          {/* The sidebar is generic-shell chrome: hidden when embedded, and —
              the R3 gate — only rendered when the generic plugin is present in
              the composition. With no declared composition this reads active,
              so classic Connect is unchanged. */}
          {!isEmbedded && (
            <IfPlugin module={GENERIC_PLUGIN}>
              <Sidebar />
            </IfPlugin>
          )}
          <div className="relative flex-1 overflow-auto">
            <Outlet />
          </div>
        </Suspense>
      </div>
    </div>
  );
}
