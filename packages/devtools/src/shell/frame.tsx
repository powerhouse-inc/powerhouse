import {
  ChevronDown,
  ExternalLink,
  MoreHorizontal,
  PanelBottom,
  PanelRight,
  Search,
  X,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { TabCount, TabList } from "../components/tabs.js";
import { cn } from "../lib/cn.js";
import { Button, buttonVariants } from "../ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.js";
import { Kbd } from "../ui/kbd.js";
import {
  ResizeHandle,
  storedWidth,
  useStoredWidth,
} from "../ui/resize-handle.js";
import { ScrollArea } from "../ui/scroll-area.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.js";
import { panelById, tabOf } from "./location.js";
import { PowerhouseMark } from "./mark.js";
import { usePageLinks } from "./page-link.js";
import type { Badge, PanelDef } from "./registry.js";
import { paletteShortcutLabel, toggleShortcutLabel } from "./shortcuts.js";
import { useShell } from "./state.js";

export type FrameMode = "docked" | "fullscreen" | "standalone";

function badgeTone(badge: Badge) {
  return badge.tone === "error" ? "text-destructive" : "text-warning";
}

function NavBadge({ useBadge }: { useBadge: () => Badge | undefined }) {
  const badge = useBadge();
  if (!badge) return null;
  return (
    <span
      className={cn(
        "ml-auto font-mono text-[11px] tabular-nums",
        badgeTone(badge),
      )}
    >
      {badge.count}
    </span>
  );
}

function NavDot({ useBadge }: { useBadge: () => Badge | undefined }) {
  const badge = useBadge();
  if (!badge) return null;
  return (
    <span
      className={cn(
        "absolute top-1 right-1.5 size-1.5 rounded-full",
        badge.tone === "error" ? "bg-destructive" : "bg-warning",
      )}
    />
  );
}

function NavItem({ panel, compact }: { panel: PanelDef; compact?: boolean }) {
  const { location, navigate } = useShell();
  const active = location.panel === panel.id;
  const button = (
    <button
      type="button"
      onClick={() => navigate({ panel: panel.id })}
      data-panel={panel.id}
      aria-label={panel.title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-7 w-full items-center gap-2 text-left text-[13px] text-muted-foreground hover:text-foreground",
        compact ? "justify-center" : "px-3",
        active && "bg-foreground/[0.09] text-foreground",
      )}
    >
      <panel.icon className="size-3.5 shrink-0" />
      {!compact && <span className="truncate">{panel.title}</span>}
      {panel.useBadge &&
        (compact ? (
          <NavDot useBadge={panel.useBadge} />
        ) : (
          <NavBadge useBadge={panel.useBadge} />
        ))}
    </button>
  );
  if (!compact) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{panel.title}</TooltipContent>
    </Tooltip>
  );
}

const NAV_WIDTH = { initial: 176, min: 140, max: 320 };
const NAV_WIDTH_STORED = storedWidth("nav-width", NAV_WIDTH);

function Nav() {
  const { registry } = useShell();
  const [width, setWidth] = useStoredWidth(NAV_WIDTH_STORED, NAV_WIDTH);
  return (
    <div
      className="relative hidden shrink-0 @lg/frame:flex"
      style={{ "--ph-nav-w": `${width}px` } as CSSProperties}
    >
      <ScrollArea
        render={<nav aria-label="DevTools pages" />}
        className="w-11 border-r @4xl/frame:w-(--ph-nav-w)"
      >
        <div className="py-1.5">
          {registry.groups.map((group, i) => (
            <div
              key={group.id}
              role="group"
              aria-label={group.label}
              className={cn(i > 0 && "mt-3")}
            >
              <div className="hidden px-3 pt-0.5 pb-1 text-[11px] text-muted-foreground @4xl/frame:block">
                {group.label}
              </div>
              {registry.panels
                .filter((p) => p.group === group.id)
                .map((p) => (
                  <div key={p.id}>
                    <div className="@4xl/frame:hidden">
                      <NavItem panel={p} compact />
                    </div>
                    <div className="hidden @4xl/frame:block">
                      <NavItem panel={p} />
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </ScrollArea>
      <ResizeHandle
        label="Resize the DevTools pages list"
        data-testid="ph-nav-resize"
        width={width}
        limits={NAV_WIDTH}
        onWidth={setWidth}
        className="absolute inset-y-0 left-full hidden @4xl/frame:block"
      />
    </div>
  );
}

/** DevTools' name in its bar: the same in the dock and on the standalone
 * page, whichever page shows. Each bar hides it when narrow, where the page
 * name needs the room and the mark still names DevTools. */
export function DevtoolsTitle() {
  return (
    <span
      data-testid="ph-devtools-title"
      className="shrink-0 text-[13px] font-medium whitespace-nowrap text-foreground"
    >
      PH DevTools
    </span>
  );
}

export function PanelSwitcher() {
  const { registry, location, navigate } = useShell();
  const current = panelById(registry, location.panel);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 max-w-full min-w-0 gap-1.5 px-1.5 text-[13px]"
            aria-label="Choose page"
          >
            <current.icon className="size-3.5" />
            <span className="truncate">{current.title}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent className="w-56">
        {registry.groups.map((group, i) => (
          <DropdownMenuGroup key={group.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[11px] font-normal">
              {group.label}
            </DropdownMenuLabel>
            {registry.panels
              .filter((p) => p.group === group.id)
              .map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => navigate({ panel: p.id })}
                  className={cn(
                    "text-[13px]",
                    p.id === current.id && "bg-accent",
                  )}
                >
                  <p.icon />
                  {p.title}
                  {p.useBadge && <NavBadge useBadge={p.useBadge} />}
                </DropdownMenuItem>
              ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PanelTabCount({ useCount }: { useCount: () => number }) {
  const count = useCount();
  if (!count) return null;
  return <TabCount tone="error">{count}</TabCount>;
}

function TabStrip() {
  const { registry, location, setTab } = useShell();
  const panel = panelById(registry, location.panel);
  if (panel.tabs.length < 2) return null;
  return (
    <TabList
      label={panel.title}
      tabs={panel.tabs.map((t) => ({
        id: t.id,
        label: t.title,
        aside: t.useCount && <PanelTabCount useCount={t.useCount} />,
      }))}
      selected={location.tab}
      onSelect={setTab}
      className="px-3"
    />
  );
}

function IconButton({
  label,
  shortcut,
  onClick,
  children,
  ...props
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            aria-label={label}
            {...props}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

const otherDock = { bottom: "right", right: "bottom" } as const;
const DOCK_LABEL = { bottom: "Dock to bottom", right: "Dock to right" };
const DOCK_ICON = { bottom: PanelBottom, right: PanelRight };

function MoreMenu({ mode }: { mode: FrameMode }) {
  const { setDock } = useShell();
  const links = usePageLinks();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="More DevTools options"
          >
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        {mode === "docked" &&
          (["bottom", "right"] as const).map((dock) => {
            const Icon = DOCK_ICON[dock];
            return (
              <DropdownMenuItem
                key={dock}
                className="text-xs"
                onClick={() => setDock(dock)}
              >
                <Icon />
                {DOCK_LABEL[dock]}
              </DropdownMenuItem>
            );
          })}
        <DropdownMenuItem
          className="text-xs"
          render={<a {...links.standalone} />}
        >
          <ExternalLink />
          Open standalone
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Opens the command palette. Wide enough to read as a search field once its
 * container has the room. */
export function SearchButton() {
  const { setPaletteOpen } = useShell();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            data-testid="ph-devtools-search"
            className="h-7 gap-1.5 px-1.5 text-xs font-normal text-muted-foreground @lg:w-64 @lg:justify-start @lg:pl-2"
            onClick={() => setPaletteOpen(true)}
            aria-label="Command palette"
          >
            <Search className="size-3.5" />
            <span className="hidden @lg:inline">Search</span>
            <Kbd className="hidden @md:inline-flex @lg:ml-auto">
              {paletteShortcutLabel()}
            </Kbd>
          </Button>
        }
      />
      <TooltipContent>
        Command palette
        <Kbd>{paletteShortcutLabel()}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

export function DevtoolsFrame({ mode }: { mode: FrameMode }) {
  const shell = useShell();
  const links = usePageLinks();
  const { registry, location, dock } = shell;
  const panel = panelById(registry, location.panel);
  const tab = tabOf(panel, location.tab);
  const Panel = tab.component;
  const DockIcon = DOCK_ICON[otherDock[dock]];
  return (
    <div
      data-testid="ph-devtools"
      data-mode={mode}
      data-dock={mode === "docked" ? dock : undefined}
      className="@container/frame flex h-full min-h-0 flex-col bg-background text-foreground"
    >
      {mode !== "standalone" && (
        <header className="flex h-10 shrink-0 items-center gap-1.5 border-b px-2">
          <PowerhouseMark />
          {/* From this width the title fits beside the longest page name. */}
          <div className="hidden shrink-0 @min-[25rem]/frame:block">
            <DevtoolsTitle />
          </div>
          {/* Below this width the pages list is hidden. */}
          <div className="min-w-0 @lg/frame:hidden">
            <PanelSwitcher />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <SearchButton />
            <div className="hidden items-center gap-0.5 @2xl/frame:flex">
              {mode === "docked" && (
                <IconButton
                  label={DOCK_LABEL[otherDock[dock]]}
                  onClick={() => shell.setDock(otherDock[dock])}
                >
                  <DockIcon />
                </IconButton>
              )}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <a
                      {...links.standalone}
                      aria-label="Open standalone"
                      className={buttonVariants({
                        variant: "ghost",
                        size: "icon-sm",
                      })}
                    >
                      <ExternalLink />
                    </a>
                  }
                />
                <TooltipContent>Open standalone</TooltipContent>
              </Tooltip>
            </div>
            <div className="@2xl/frame:hidden">
              <MoreMenu mode={mode} />
            </div>
            <IconButton
              label="Close DevTools"
              shortcut={toggleShortcutLabel()}
              onClick={() => shell.setOpen(false)}
              data-testid="ph-devtools-close"
            >
              <X />
            </IconButton>
          </div>
        </header>
      )}
      <div className="flex min-h-0 flex-1">
        <Nav />
        <div className="flex min-w-0 flex-1 flex-col">
          <TabStrip />
          {tab.fill ? (
            <main
              key={`${panel.id}/${tab.id}`}
              data-testid="ph-panel"
              data-panel={panel.id}
              data-tab={tab.id}
              className="@container/main flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <Panel apiBase={shell.host.apiBase} focus={location.focus} />
            </main>
          ) : (
            <ScrollArea
              render={<main />}
              className="min-w-0 flex-1"
              key={`${panel.id}/${tab.id}`}
              viewportProps={{
                "data-testid": "ph-panel",
                "data-panel": panel.id,
                "data-tab": tab.id,
              }}
            >
              <div className="@container/main p-2 @md/frame:p-3">
                <Panel apiBase={shell.host.apiBase} focus={location.focus} />
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
