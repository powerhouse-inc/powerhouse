import {
  Analytics,
  AppSkeleton,
  CookieBanner,
  ModalsContainer,
  // ProcessorManagerProvider,
  SentryProvider,
  Sidebar,
  useCheckLatestVersion,
  useSetSentryUser,
  useSubscribeToVetraPackages,
} from "@powerhousedao/connect";
import { ToastContainer, WagmiContext } from "@powerhousedao/design-system";
import { StrictMode, Suspense } from "react";
import { Await, Outlet, useLoaderData } from "react-router";
import type { loader } from "./root.loader.js";

function OnLoad() {
  useSubscribeToVetraPackages();
  useSetSentryUser();
  useCheckLatestVersion();
  return null;
}

export function Root() {
  const { reactor } = useLoaderData<typeof loader>();

  return (
    <StrictMode>
      <Suspense name="Root" fallback={<AppSkeleton />}>
        <div
          className="flex h-screen items-stretch overflow-auto"
          role="presentation"
          tabIndex={0}
        >
          <SentryProvider>
            <WagmiContext>
              <Await resolve={reactor}>
                {/* <ProcessorManagerProvider> */}
                <ToastContainer position="bottom-right" containerId="connect" />
                <OnLoad />
                <Sidebar />
                <div className="relative flex h-full flex-1 flex-col overflow-auto">
                  <Outlet />
                </div>
                <Analytics />
                {/* </ProcessorManagerProvider> */}
              </Await>
            </WagmiContext>
          </SentryProvider>
        </div>
      </Suspense>
      <Suspense name="CookieBanner">
        <CookieBanner />
      </Suspense>
      <ModalsContainer />
    </StrictMode>
  );
}
