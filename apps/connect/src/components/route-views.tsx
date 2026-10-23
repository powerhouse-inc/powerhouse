import { useRouter, useRouterState } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import AppSkeleton from "./app-skeleton.js";
import { LoadingShell } from "./prerendered-shell.js";

// Loads quicker than this show no progress bar.
export const PROGRESS_DELAY_MS = 150;

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
      {isEmpty && <LoadingShell Fallback={AppSkeleton} />}
      {children}
      <RouteProgressBar />
    </>
  );
}
