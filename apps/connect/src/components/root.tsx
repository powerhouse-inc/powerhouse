import { ModalManager, Sidebar } from "@powerhousedao/connect";
import { Suspense } from "react";
import { Outlet } from "react-router-dom";

export function Root() {
  return (
    <ModalManager>
      <div className="h-screen">
        <div
          className={`flex h-screen items-stretch overflow-auto`}
          role="presentation"
          tabIndex={0}
        >
          <Suspense name="Root">
            <Sidebar />
            <div className="relative flex-1 overflow-auto">
              <Outlet />
            </div>
          </Suspense>
        </div>
      </div>
    </ModalManager>
  );
}
