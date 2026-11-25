import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { resolveHost, type DevtoolsProps } from "../props.js";
import { DevtoolsPortalProvider } from "../ui/portal.js";
import { TooltipProvider } from "../ui/tooltip.js";
import { CommandPalette } from "./command-palette.js";
import { DockedDevtools } from "./dock.js";
import { DevtoolsFrame } from "./frame.js";
import { Launcher } from "./launcher.js";
import { subscribeToPageMoves } from "./page-link.js";
import type { Registry } from "./registry.js";
import { useShortcuts } from "./shortcuts.js";
import { StandalonePage } from "./standalone.js";
import { ShellProvider, useShell, type ShellMode } from "./state.js";
import { InfoProvider } from "./use-info.js";

const TOO_SMALL_TO_DOCK = "(max-width: 767px), (max-height: 539px)";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

function subscribeToHistory(onChange: () => void) {
  const stopPageMoves = subscribeToPageMoves(onChange);
  // Where the browser has it: it also tells of a router's own navigation,
  // which changes the URL without a `popstate`.
  const { navigation } = window as { navigation?: EventTarget };
  navigation?.addEventListener("currententrychange", onChange);
  return () => {
    stopPageMoves();
    navigation?.removeEventListener("currententrychange", onChange);
  };
}

const trimSlash = (pathname: string) => pathname.replace(/\/+$/, "");

export function useIsStandalonePath(standaloneHref: string): boolean {
  const pathname = useSyncExternalStore(
    subscribeToHistory,
    () => window.location.pathname,
  );
  const standalone = new URL(standaloneHref, window.location.href).pathname;
  return trimSlash(pathname) === trimSlash(standalone);
}

function Dock() {
  const shell = useShell();
  const fullscreen = useMediaQuery(TOO_SMALL_TO_DOCK);
  useShortcuts({
    onToggle: () => shell.setOpen(!shell.open),
    onPalette: () => {
      if (!shell.open) shell.setOpen(true);
      shell.setPaletteOpen(!shell.paletteOpen);
    },
  });
  return (
    <>
      {shell.open &&
        (fullscreen ? (
          <div className="fixed inset-0 z-50">
            <DevtoolsFrame mode="fullscreen" />
          </div>
        ) : (
          <DockedDevtools />
        ))}
      <Launcher />
      <CommandPalette mode={fullscreen ? "fullscreen" : "docked"} />
    </>
  );
}

type RootProps = DevtoolsProps & { registry: Registry };

/** Where DevTools shows: docked over the app, or as a page of its own. */
export type ShellSurface = "dock" | "page";

const SURFACE: Record<ShellSurface, { mode: ShellMode; className: string }> = {
  dock: { mode: "dock", className: "top-0 left-0 size-0" },
  page: {
    mode: "standalone",
    className: "inset-0 flex flex-col bg-background",
  },
};

const Bare = ({ children }: { children: ReactNode }) => <>{children}</>;

/**
 * DevTools on one of its surfaces. The theme tokens are scoped to its root
 * element, so popups mount in a container inside it, and it is one stacking
 * context above the app: every layer inside is relative to it. The same
 * element serves both surfaces, so what DevTools holds, such as the project
 * it read, stays when the surface changes.
 */
export function DevtoolsShell({
  surface,
  registry,
  base,
  standaloneHref,
  appHref,
  bottomRightReserved,
  openInEditorUrl,
  app,
}: RootProps & { surface: ShellSurface }) {
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const host = useMemo(
    () =>
      resolveHost({
        base,
        standaloneHref,
        appHref,
        bottomRightReserved,
        openInEditorUrl,
        app,
      }),
    [base, standaloneHref, appHref, bottomRightReserved, openInEditorUrl, app],
  );
  const { mode, className } = SURFACE[surface];
  const Provider = registry.Provider ?? Bare;
  return (
    <div
      className={cn(
        "ph-devtools fixed z-[2000] text-left font-sans text-[13px] leading-normal font-normal text-foreground",
        className,
      )}
    >
      <DevtoolsPortalProvider container={portal}>
        <TooltipProvider delay={300}>
          <ShellProvider host={host} registry={registry} mode={mode}>
            <InfoProvider apiBase={host.apiBase}>
              <Provider apiBase={host.apiBase}>
                {surface === "page" ? <StandalonePage /> : <Dock />}
              </Provider>
            </InfoProvider>
          </ShellProvider>
        </TooltipProvider>
      </DevtoolsPortalProvider>
      <div
        ref={setPortal}
        className="pointer-events-none fixed inset-0 z-60 *:pointer-events-auto"
      />
    </div>
  );
}

/** The dock, on every path but the standalone page's. */
export function DevtoolsRoot(props: RootProps) {
  if (useIsStandalonePath(resolveHost(props).standaloneHref)) return null;
  return <DevtoolsShell {...props} surface="dock" />;
}

export function DevtoolsStandalone(props: RootProps) {
  return <DevtoolsShell {...props} surface="page" />;
}
