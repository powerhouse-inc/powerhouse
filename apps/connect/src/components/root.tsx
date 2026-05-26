import { Sidebar } from "@powerhousedao/connect/components";
import { useIsEmbedded } from "@powerhousedao/connect/hooks";
import { Suspense } from "react";
import { Outlet } from "react-router-dom";

export function Root() {
  const isEmbedded = useIsEmbedded();
  return (
    <div className="h-screen bg-white dark:bg-slate-800">
      <div
        className={`flex h-screen items-stretch overflow-auto`}
        role="presentation"
        tabIndex={0}
      >
        <Suspense name="Root">
          {!isEmbedded && <Sidebar />}
          <div className="relative flex-1 overflow-auto">
            <Outlet />
          </div>
        </Suspense>
      </div>
    </div>
  );
}
