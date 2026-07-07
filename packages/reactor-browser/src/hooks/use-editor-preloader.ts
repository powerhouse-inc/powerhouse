import { useEffect } from "react";
import {
  hasPreloadBandwidth,
  preloadEditorModule,
} from "../utils/preload-editor.js";
import { useAppModules, useEditorModules } from "./editor-modules.js";

type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number };

function requestIdle(cb: (deadline: IdleDeadline) => void): number {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(cb);
  }
  // Fallback: hand out a short, draining time budget so pump processes a slice
  // and reschedules, rather than emptying the whole queue in one task.
  return window.setTimeout(() => {
    const start = Date.now();
    cb({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 8 - (Date.now() - start)),
    });
  }, 200);
}

function cancelIdle(handle: number): void {
  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(handle);
  } else {
    window.clearTimeout(handle);
  }
}

// Warms every registered editor's lazy chunk during browser idle time when
// bandwidth allows, so opening a document doesn't wait on a network fetch.
export function useEditorPreloader(): void {
  const editorModules = useEditorModules();
  const appModules = useAppModules();

  useEffect(() => {
    const queue = [...(editorModules ?? []), ...(appModules ?? [])];
    if (queue.length === 0 || !hasPreloadBandwidth()) return;

    let cancelled = false;
    let handle = 0;

    const pump = (deadline: IdleDeadline) => {
      while (
        !cancelled &&
        queue.length > 0 &&
        (deadline.didTimeout || deadline.timeRemaining() > 0)
      ) {
        const editorModule = queue.shift()!;
        void preloadEditorModule(editorModule);
      }
      if (!cancelled && queue.length > 0) handle = requestIdle(pump);
    };

    handle = requestIdle(pump);

    return () => {
      cancelled = true;
      if (handle) cancelIdle(handle);
    };
  }, [editorModules, appModules]);
}
