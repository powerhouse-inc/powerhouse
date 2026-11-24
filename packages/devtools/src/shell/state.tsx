import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { stored, useStored, type Stored } from "../lib/stored.js";
import type { DevtoolsHost } from "../props.js";
import {
  defaultPanel,
  parseView,
  resolveTarget,
  SHARE_PARAM,
  sharedPanel,
  type DevtoolsLocation,
  type DevtoolsTarget,
  type DevtoolsView,
} from "./location.js";
import type { Registry } from "./registry.js";

export type DockPosition = "bottom" | "right";

const DEFAULT_SIZE: Record<DockPosition, number> = {
  bottom: 0.48,
  right: 0.46,
};
export const MIN_SIZE = 0.22;
export const MAX_SIZE = 0.92;

export const clampSize = (size: number) =>
  Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));

const VIEW = stored<DevtoolsView>({
  key: "view",
  scope: "tab",
  fallback: { open: false },
  parse: parseView,
});

const DOCK = stored<DockPosition>({
  key: "dock",
  scope: "preference",
  fallback: "bottom",
  parse: (json) => (json === "bottom" || json === "right" ? json : undefined),
});

const dockSize = (dock: DockPosition) =>
  stored<number>({
    key: `size:${dock}`,
    scope: "preference",
    fallback: DEFAULT_SIZE[dock],
    parse: (json) =>
      typeof json === "number" && json >= MIN_SIZE && json <= MAX_SIZE
        ? json
        : undefined,
  });

const SIZE: Record<DockPosition, Stored<number>> = {
  bottom: dockSize("bottom"),
  right: dockSize("right"),
};

const updateView = (change: (view: DevtoolsView) => DevtoolsView) =>
  VIEW.set(change(VIEW.get()));

function removeFromUrl(name: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url);
}

/** Opens DevTools where a share link says, then takes the link's param out
 * of the URL without a new history entry. */
function useShareLink(removeSearchParam = removeFromUrl) {
  const [shared] = useState(() => sharedPanel(window.location.search));
  const remove = useRef(removeSearchParam);
  useEffect(() => {
    remove.current = removeSearchParam;
  });
  useLayoutEffect(() => {
    if (shared === undefined) return;
    updateView((view) =>
      shared
        ? { open: true, target: { panel: shared } }
        : { ...view, open: true },
    );
    remove.current(SHARE_PARAM);
  }, [shared]);
}

export type ShellMode = "dock" | "standalone";

export type Shell = {
  host: DevtoolsHost;
  registry: Registry;
  mode: ShellMode;
  open: boolean;
  location: DevtoolsLocation;
  dock: DockPosition;
  /** The dock's share of the window, from MIN_SIZE to MAX_SIZE. */
  size: number;
  paletteOpen: boolean;
  /** Whether the launcher is put away until the page loads again. */
  launcherHidden: boolean;
  hideLauncher: () => void;
  navigate: (target: DevtoolsTarget) => void;
  setTab: (tab: string) => void;
  setOpen: (open: boolean) => void;
  setDock: (dock: DockPosition) => void;
  /** Saves the size when `save`, and only shows it while dragging. */
  setSize: (size: number, save: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
};

const ShellContext = createContext<Shell | null>(null);

export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside ShellProvider");
  return shell;
}

export function ShellProvider({
  host,
  registry,
  mode,
  children,
}: {
  host: DevtoolsHost;
  registry: Registry;
  mode: ShellMode;
  children: ReactNode;
}) {
  useShareLink(host.app.removeSearchParam);
  const [view] = useStored(VIEW);
  const [dock] = useStored(DOCK);
  const [savedSize] = useStored(SIZE[dock]);
  const [dragSize, setDragSize] = useState<number>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [launcherHidden, setLauncherHidden] = useState(false);

  const open = mode === "standalone" || view.open;

  const shell = useMemo<Shell>(() => {
    const home: DevtoolsTarget = { panel: defaultPanel(registry).id };
    const location = resolveTarget(view.target ?? home, registry);
    return {
      host,
      registry,
      mode,
      open,
      location,
      dock,
      size: dragSize ?? savedSize,
      paletteOpen,
      launcherHidden,
      hideLauncher: () => setLauncherHidden(true),
      navigate: (target) => {
        setPaletteOpen(false);
        // The standalone page leaves the dock as it was.
        updateView(({ open }) => ({ open: mode === "dock" || open, target }));
      },
      setTab: (tab) =>
        updateView((view) => ({
          ...view,
          target: { panel: location.panel, tab },
        })),
      setOpen: (next) => {
        if (!next) setPaletteOpen(false);
        updateView((view) => ({ ...view, open: next }));
      },
      setDock: (next) => {
        setDragSize(undefined);
        DOCK.set(next);
      },
      setSize: (size, save) => {
        setDragSize(save ? undefined : size);
        if (save) SIZE[dock].set(size);
      },
      setPaletteOpen,
    };
  }, [
    view,
    dock,
    savedSize,
    dragSize,
    paletteOpen,
    launcherHidden,
    host,
    registry,
    mode,
    open,
  ]);

  return (
    <ShellContext.Provider value={shell}>{children}</ShellContext.Provider>
  );
}
