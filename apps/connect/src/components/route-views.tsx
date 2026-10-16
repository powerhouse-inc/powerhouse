import { DefaultEditorLoader } from "@powerhousedao/design-system/connect";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useMatch, useRouter, useRouterState } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import { HOME_ROUTE_ID } from "../router/route-tree.js";
import AppSkeleton from "./app-skeleton.js";
import { CenteredErrorMessage } from "./error-boundary.js";

// Loads quicker than this show no progress bar.
const PROGRESS_DELAY_MS = 150;

/** True until the router has resolved its first location. */
export function useIsColdStart() {
  return useRouterState({ select: (state) => !state.resolvedLocation });
}

/** Whether the content shows home: a cold deep link shows the pending view. */
export function useShowsHomeScreen(hasSelection: boolean) {
  const isColdStart = useIsColdStart();
  const isHomeRoute = !!useMatch({ from: HOME_ROUTE_ID, shouldThrow: false });
  return !hasSelection && (isHomeRoute || !isColdStart);
}

// Fades the cold-start loader in, so a load ending just past pendingMs doesn't flash.
const DRIVE_PENDING_FADE = "ph-drive-pending-in 200ms ease-in 100ms both";

/** A loader on a cold start; otherwise the open view stays while loading. */
export function DrivePending() {
  const isColdStart = useIsColdStart();
  if (!isColdStart) return null;
  return (
    <div
      className="flex size-full items-center justify-center"
      style={{ animation: DRIVE_PENDING_FADE }}
    >
      <style>
        {`@keyframes ph-drive-pending-in{from{opacity:0}to{opacity:1}}`}
      </style>
      <DefaultEditorLoader message="Loading drive" />
    </div>
  );
}

/** A route's loader or render error, as Connect's error boundaries show it. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  return <CenteredErrorMessage error={error} resetErrorBoundary={reset} />;
}

/** A thin top bar while a route takes longer than PROGRESS_DELAY_MS. */
export function RouteProgressBar() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  // Router events, not state: a quick load never re-renders the bar.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(true), PROGRESS_DELAY_MS);
    };
    const stop = () => {
      clearTimeout(timer);
      setVisible(false);
    };
    // The first load starts before this effect subscribes.
    if (router.state.isLoading) start();
    const unsubscribes = [
      router.subscribe("onBeforeLoad", start),
      router.subscribe("onResolved", stop),
    ];
    return () => {
      clearTimeout(timer);
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [router]);
  if (!visible) return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden"
    >
      <style>
        {`@keyframes ph-route-progress{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}`}
      </style>
      <div
        className="h-full w-2/5 bg-[#3b82f6]"
        style={{ animation: "ph-route-progress 1.1s ease-in-out infinite" }}
      />
    </div>
  );
}

/** Wraps the matches: the skeleton until the first view shows, and the bar. */
export function RouterChrome({ children }: PropsWithChildren) {
  const isEmpty = useRouterState({ select: (state) => !state.matches.length });
  return (
    <>
      {isEmpty && <AppSkeleton />}
      {children}
      <RouteProgressBar />
    </>
  );
}
