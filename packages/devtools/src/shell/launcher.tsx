import {
  CircleX,
  ExternalLink,
  EyeOff,
  LayoutGrid,
  MoreHorizontal,
  Pin,
  TriangleAlert,
} from "lucide-react";
import { plural } from "../lib/plural.js";
import { cn } from "../lib/cn.js";
import { stored, useStored } from "../lib/stored.js";
import { Button } from "../ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.js";
import { Kbd } from "../ui/kbd.js";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.js";
import {
  ANCHORS,
  anchorMargin,
  useLauncherDrag,
  type Anchor,
} from "./launcher-drag.js";
import { defaultPanel } from "./location.js";
import { PowerhouseMark } from "./mark.js";
import { usePageLinks } from "./page-link.js";
import type { Badge, PanelDef, PanelMark, Registry } from "./registry.js";
import { toggleShortcutLabel } from "./shortcuts.js";
import { useShell } from "./state.js";

type Point = { x: number; y: number };

const translate = (p: Point) => `translate(${p.x}px, ${p.y}px)`;

/** Clear space between the launcher and a control the app keeps in the
 * bottom-right corner. */
const RESERVED_GAP = 8;

/** How far left of the corner the launcher rests, to clear `reserved` pixels
 * from the window's right edge. */
const insetFor = (reserved: number) =>
  reserved > 0
    ? Math.max(0, reserved + RESERVED_GAP - anchorMargin(window.innerWidth))
    : 0;

const PINS = stored<string[]>({
  key: "launcher-pins",
  scope: "preference",
  fallback: [],
  parse: (json) =>
    Array.isArray(json) && json.every((id) => typeof id === "string")
      ? json
      : undefined,
});

type Side = "top" | "bottom";
type Align = "start" | "center" | "end";

function placement(anchor: Anchor): { side: Side; align: Align } {
  const [v, h] = anchor.split("-");
  return {
    side: v === "top" ? "bottom" : "top",
    align: h === "left" ? "start" : h === "right" ? "end" : "center",
  };
}

const noBadge = (): Badge | undefined => undefined;
const noMark = (): PanelMark | undefined => undefined;
const notUnavailable = (): string | undefined => undefined;

const badgeText = (badge: Badge) =>
  badge.tone === "error"
    ? `${badge.count} failing`
    : plural(badge.count, "warning");

const showsOnLauncher = (badge: Badge | undefined, pinned: boolean) =>
  pinned || badge?.tone === "error";

/** What the launcher draws over a panel's icon: its badge's tone, or a
 * warning for a mark alone. */
const signTone = (
  badge: Badge | undefined,
  mark: PanelMark | undefined,
): Badge["tone"] | undefined => badge?.tone ?? (mark ? "warn" : undefined);

function BadgeMark({ tone }: { tone: Badge["tone"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute top-1 right-1",
        tone === "error"
          ? "size-2 rounded-full bg-destructive ring-2 ring-background"
          : "h-2 w-2.5 bg-warning [clip-path:polygon(50%_0,100%_100%,0_100%)]",
      )}
    />
  );
}

const barButton = "relative size-8 rounded-full text-muted-foreground";

/** The panels besides the default one, which the mark stands for. */
const pinnablePanels = (registry: Registry) => {
  const home = defaultPanel(registry).id;
  return registry.panels.filter((panel) => panel.id !== home);
};

export function Launcher() {
  const { open, setOpen, host, registry, launcherHidden, hideLauncher } =
    useShell();
  const {
    anchor,
    attach,
    handlers,
    style,
    dragging,
    size,
    target,
    targetPoint,
  } = useLauncherDrag();
  const [pins, setPins] = useStored(PINS);
  if (open || launcherHidden) return null;

  const inset = insetFor(host.bottomRightReserved);
  const anchorAt = (anchor: Anchor): Point | null => {
    const point = targetPoint(anchor);
    if (!point || anchor !== "bottom-right") return point;
    return { x: Math.max(0, point.x - inset), y: point.y };
  };
  const corner = targetPoint("bottom-right");
  const shifted =
    corner && style.transform === translate(corner)
      ? anchorAt("bottom-right")
      : null;
  const { side, align } = placement(anchor);
  const togglePin = (id: string) =>
    setPins(pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id]);

  return (
    <>
      {dragging &&
        size &&
        ANCHORS.map((anchor) => {
          const point = anchorAt(anchor);
          if (!point) return null;
          return (
            <div
              key={anchor}
              aria-hidden
              data-launcher-target={anchor}
              className={cn(
                "pointer-events-none fixed top-0 left-0 z-40 rounded-full border border-dashed transition-colors",
                anchor === target
                  ? "border-primary bg-primary/15"
                  : "border-foreground/25 bg-foreground/5",
              )}
              style={{
                width: size.w,
                height: size.h,
                transform: translate(point),
              }}
            />
          );
        })}
      <div
        role="group"
        aria-label="DevTools"
        ref={attach}
        {...handlers}
        style={shifted ? { ...style, transform: translate(shifted) } : style}
        data-testid="ph-launcher-bar"
        className={cn(
          "fixed top-0 left-0 z-40 flex h-10 items-center gap-0.5 rounded-full border bg-background p-1 text-foreground shadow-lg select-none",
          dragging && "cursor-grabbing shadow-2xl",
        )}
      >
        <MarkButton side={side} onOpen={() => setOpen(true)} />
        <div className="flex items-center gap-0.5 empty:hidden before:mx-0.5 before:h-5 before:w-px before:bg-border">
          {pinnablePanels(registry).map((panel) => (
            <LauncherPanel
              key={panel.id}
              panel={panel}
              useBadge={panel.useBadge ?? noBadge}
              useMark={panel.useMark ?? noMark}
              pinned={pins.includes(panel.id)}
              side={side}
            />
          ))}
        </div>
        <PanelList
          side={side}
          align={align}
          pins={pins}
          onTogglePin={togglePin}
        />
        <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
        <LauncherMenu side={side} align={align} onHide={hideLauncher} />
      </div>
    </>
  );
}

function MarkButton({ side, onOpen }: { side: Side; onOpen: () => void }) {
  const { registry } = useShell();
  const useUnavailable = registry.useUnavailable ?? notUnavailable;
  const down = useUnavailable();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpen}
            data-testid="ph-launcher"
            aria-label={down ? `Open DevTools. ${down}` : "Open DevTools"}
            className={barButton}
          >
            <PowerhouseMark className={cn(down && "opacity-40 grayscale")} />
            {down && (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-2 rounded-full bg-muted-foreground ring-2 ring-background"
              />
            )}
          </Button>
        }
      />
      <TooltipContent side={side}>
        {down ?? "Open DevTools"}
        {!down && <Kbd>{toggleShortcutLabel()}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

function LauncherPanel({
  panel,
  useBadge,
  useMark,
  pinned,
  side,
}: {
  panel: PanelDef;
  useBadge: () => Badge | undefined;
  useMark: () => PanelMark | undefined;
  pinned: boolean;
  side: Side;
}) {
  const { navigate } = useShell();
  const badge = useBadge();
  const mark = useMark();
  if (!showsOnLauncher(badge, pinned)) return null;
  const tone = signTone(badge, mark);
  const label = [panel.title, badge && badgeText(badge), mark?.label]
    .filter(Boolean)
    .join(" · ");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ panel: panel.id })}
            data-launcher-panel={panel.id}
            aria-label={`Open ${label}`}
            className={barButton}
          >
            <panel.icon />
            {tone && <BadgeMark tone={tone} />}
          </Button>
        }
      />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

function OffLauncherWarning({
  panel,
  useBadge,
  useMark,
  pinned,
}: {
  panel: PanelDef;
  useBadge: () => Badge | undefined;
  useMark: () => PanelMark | undefined;
  pinned: boolean;
}) {
  const badge = useBadge();
  const mark = useMark();
  const tone = signTone(badge, mark);
  if (!tone || showsOnLauncher(badge, pinned)) return null;
  const said = [badge && badgeText(badge), mark?.label]
    .filter(Boolean)
    .join(", ");
  return (
    <>
      <BadgeMark tone={tone} />
      <span className="sr-only">
        , {panel.title}: {said}
      </span>
    </>
  );
}

function PanelList({
  side,
  align,
  pins,
  onTogglePin,
}: {
  side: Side;
  align: Align;
  pins: string[];
  onTogglePin: (id: string) => void;
}) {
  const { registry } = useShell();
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="ph-launcher-panels"
                  className={barButton}
                >
                  <LayoutGrid />
                  <span className="sr-only">All panels</span>
                  {pinnablePanels(registry).map((panel) => (
                    <OffLauncherWarning
                      key={panel.id}
                      panel={panel}
                      useBadge={panel.useBadge ?? noBadge}
                      useMark={panel.useMark ?? noMark}
                      pinned={pins.includes(panel.id)}
                    />
                  ))}
                </Button>
              }
            />
          }
        />
        <TooltipContent side={side}>All panels</TooltipContent>
      </Tooltip>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        aria-label="All panels"
        className="w-80 overflow-y-auto p-1"
      >
        <div className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
          Panels
        </div>
        {registry.panels.map((panel) => (
          <PanelRow
            key={panel.id}
            panel={panel}
            useBadge={panel.useBadge ?? noBadge}
            useMark={panel.useMark ?? noMark}
            pinned={pins.includes(panel.id)}
            onTogglePin={
              panel.id === defaultPanel(registry).id
                ? undefined
                : () => onTogglePin(panel.id)
            }
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function PanelRow({
  panel,
  useBadge,
  useMark,
  pinned,
  onTogglePin,
}: {
  panel: PanelDef;
  useBadge: () => Badge | undefined;
  useMark: () => PanelMark | undefined;
  pinned: boolean;
  /** Absent for the default panel: the mark opens it. */
  onTogglePin?: () => void;
}) {
  const { navigate } = useShell();
  const badge = useBadge();
  const mark = useMark();
  const StatusIcon = badge?.tone === "error" ? CircleX : TriangleAlert;
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => navigate({ panel: panel.id })}
        data-panel-row={panel.id}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <panel.icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{panel.title}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2.5 text-xs">
          {mark && (
            <span
              data-testid="ph-panel-row-mark"
              title={mark.label}
              className="flex items-center gap-1 text-warning"
            >
              <mark.icon className="size-3.5" />
              {mark.text}
            </span>
          )}
          {badge && (
            <span
              className={cn(
                "flex items-center gap-1",
                badge.tone === "error" ? "text-destructive" : "text-warning",
              )}
            >
              <StatusIcon className="size-3.5" />
              {badgeText(badge)}
            </span>
          )}
        </span>
      </button>
      {onTogglePin ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={pinned}
          aria-label={
            pinned
              ? `Unpin ${panel.title} from the launcher`
              : `Pin ${panel.title} to the launcher`
          }
          title={pinned ? "Unpin from the launcher" : "Pin to the launcher"}
          onClick={onTogglePin}
          className={cn("text-muted-foreground", pinned && "text-primary")}
        >
          <Pin className={cn(pinned && "fill-current")} />
        </Button>
      ) : (
        <span aria-hidden className="size-7 shrink-0" />
      )}
    </div>
  );
}

function LauncherMenu({
  side,
  align,
  onHide,
}: {
  side: Side;
  align: Align;
  onHide: () => void;
}) {
  const links = usePageLinks();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Launcher options"
            className={barButton}
          >
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent side={side} align={align} className="w-56">
        <DropdownMenuItem
          className="text-xs"
          render={<a {...links.standalone} />}
        >
          <ExternalLink />
          Open standalone
        </DropdownMenuItem>
        <DropdownMenuItem className="items-start text-xs" onClick={onHide}>
          <EyeOff className="mt-0.5" />
          <span className="flex flex-col">
            Hide until reload
            <span className="text-muted-foreground">
              {toggleShortcutLabel()} still opens DevTools
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
