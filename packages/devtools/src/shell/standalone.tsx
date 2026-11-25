import { useEffect } from "react";
import { cn } from "../lib/cn.js";
import { buttonVariants } from "../ui/button.js";
import { CommandPalette } from "./command-palette.js";
import {
  DevtoolsFrame,
  DevtoolsTitle,
  PanelSwitcher,
  SearchButton,
} from "./frame.js";
import { POWERHOUSE_FAVICON, PowerhouseMark } from "./mark.js";
import { usePageLinks } from "./page-link.js";
import { useShortcuts } from "./shortcuts.js";
import { useShell } from "./state.js";
import { useDevtoolsInfo } from "./use-info.js";

/** Gives the browser tab DevTools' icon and title while the page shows, and
 * puts the host page's back when it goes. */
function useTabIdentity(title: string) {
  useEffect(() => {
    const hostTitle = document.title;
    const hostIcons = [
      ...document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
    ];
    for (const icon of hostIcons) icon.remove();
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/svg+xml";
    icon.href = POWERHOUSE_FAVICON;
    document.head.append(icon);
    return () => {
      icon.remove();
      document.head.append(...hostIcons);
      document.title = hostTitle;
    };
  }, []);
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export function StandalonePage() {
  const shell = useShell();
  const links = usePageLinks();
  const info = useDevtoolsInfo();
  const project = info.state === "ready" ? info.info.project.name : null;
  useTabIdentity(project ? `DevTools · ${project}` : "DevTools");
  useShortcuts({
    onPalette: () => shell.setPaletteOpen(!shell.paletteOpen),
  });
  return (
    <>
      <header
        data-testid="ph-devtools-bar"
        className="@container/bar flex h-10 shrink-0 items-center gap-2 border-b bg-card px-2 text-[11px] text-muted-foreground"
      >
        <PowerhouseMark />
        {/* From this width the title fits beside the longest page name. */}
        <div className="hidden shrink-0 @2xl/bar:block">
          <DevtoolsTitle />
        </div>
        {/* Below this width the sidebar shows icons only, or is hidden. */}
        <div className="min-w-0 text-foreground @4xl/bar:hidden">
          <PanelSwitcher />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <SearchButton />
          <a
            {...links.app}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "h-7 shrink-0 text-xs",
            )}
          >
            Back to app
          </a>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <DevtoolsFrame mode="standalone" />
      </div>
      <CommandPalette mode="standalone" />
    </>
  );
}
