import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { ModalsContainer } from "./modal/modals-container.js";
import Sidebar from "./sidebar.js";

export default function Root() {
  return (
    <>
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
      <ModalsContainer />
    </>
  );
}
