// The app shell `ph connect build` prerenders into #root. React renders the same
// markup while the app loads, so the swap to the app has no blank frame.
import type { ComponentType, CSSProperties } from "react";
import { useEffect, useState } from "react";

/** Marks the prerendered markup; the build's guard CSS keys on it too. */
export const SHELL_MARKER = "data-ph-shell";

/** Set on `<html>` by the build's pre-paint guard (scripts/prerender-shell.ts). */
export const SHELL_GUARD_CLASSES = ["ph-shell-route", "ph-shell-embed"];

let shellHtml: string | undefined;

/** Keeps `root`'s prerendered shell to render until the app shows. */
export function adoptPrerenderedShell(root: Element | null) {
  shellHtml = root?.querySelector(`:scope > [${SHELL_MARKER}]`)?.innerHTML;
}

export function hasPrerenderedShell() {
  return shellHtml !== undefined;
}

/** The prerendered shell until the app releases it, else `Fallback`. */
export function LoadingShell({ Fallback }: { Fallback: ComponentType }) {
  // A remount restarts CSS animations; this keeps the loader's on the page's clock.
  const [style] = useState(
    () =>
      ({
        display: "contents",
        "--ph-shell-t": `-${Math.round(performance.now())}ms`,
      }) as CSSProperties,
  );
  if (shellHtml === undefined) return <Fallback />;
  return (
    <div
      {...{ [SHELL_MARKER]: "" }}
      inert
      style={style}
      dangerouslySetInnerHTML={{ __html: shellHtml }}
    />
  );
}

/** Drops the shell once the app shows; later loads use their own fallback. */
export function useReleasePrerenderedShell(released: boolean) {
  useEffect(() => {
    if (!released) return;
    shellHtml = undefined;
    // The pre-paint guard's classes and critical CSS were for the shell only.
    document.documentElement.classList.remove(...SHELL_GUARD_CLASSES);
    for (const style of document.head.querySelectorAll(
      `style[${SHELL_MARKER}]`,
    )) {
      style.remove();
    }
  }, [released]);
}
