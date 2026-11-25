import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { DevtoolsFocus } from "./location.js";

export type PanelProps = {
  apiBase: string;
  focus?: DevtoolsFocus;
};

export type TabDef = {
  id: string;
  title: string;
  component: ComponentType<PanelProps>;
  useCount?: () => number;
  /** The page fills the panel and scrolls its own parts, without the panel's
   * padding or scroll area. */
  fill?: boolean;
};

export type Badge = { count: number; tone: "warn" | "error" };

export type PanelDef = {
  id: string;
  title: string;
  icon: LucideIcon;
  group: string;
  tabs: TabDef[];
  defaultTab?: () => string;
  useBadge?: () => Badge | undefined;
};

export type NavGroup = { id: string; label: string };

/** What the shell shows. The shell knows no panel of its own: what mounts
 * DevTools gives it this. */
export type Registry = {
  groups: NavGroup[];
  panels: [PanelDef, ...PanelDef[]];
  /** Goes around everything the shell renders: what the panels share, and
   * the badges on the launcher with them. */
  Provider?: ComponentType<{ apiBase: string; children: ReactNode }>;
  /** Why the panels have nothing to show, for the launcher to say while it
   * is so. Undefined while they do. */
  useUnavailable?: () => string | undefined;
};
