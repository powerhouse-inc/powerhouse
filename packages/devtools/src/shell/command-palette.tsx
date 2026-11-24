import {
  ExternalLink,
  PanelBottom,
  PanelRight,
  SearchX,
  X,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "../ui/command.js";
import type { FrameMode } from "./frame.js";
import { usePageLinks } from "./page-link.js";
import { toggleShortcutLabel } from "./shortcuts.js";
import { useShell } from "./state.js";

export function CommandPalette({ mode }: { mode: FrameMode }) {
  const shell = useShell();
  const links = usePageLinks();
  const run = (action: () => void) => () => {
    shell.setPaletteOpen(false);
    action();
  };
  return (
    <CommandDialog
      open={shell.paletteOpen}
      onOpenChange={shell.setPaletteOpen}
      title="DevTools"
      description="Jump to a page or run a DevTools action"
    >
      <Command data-testid="ph-devtools-palette">
        <CommandInput placeholder="Pages, actions…" />
        <CommandList>
          <CommandEmpty className="flex flex-col items-center gap-1 py-8 text-[13px]">
            <SearchX aria-hidden className="size-4 text-muted-foreground" />
            <span className="font-medium">No page or action matches</span>
            <span className="text-muted-foreground">
              Try a page&apos;s name, such as Editors or Processors.
            </span>
          </CommandEmpty>
          <CommandGroup heading="Pages">
            {shell.registry.panels.flatMap((p) =>
              p.tabs.map((t) => (
                <CommandItem
                  key={`${p.id}/${t.id}`}
                  value={`page ${p.title} ${t.title} ${p.id}/${t.id}`}
                  onSelect={run(() =>
                    shell.navigate({
                      panel: p.id,
                      ...(p.tabs.length > 1 && { tab: t.id }),
                    }),
                  )}
                >
                  <p.icon />
                  <span>
                    {p.title}
                    {p.tabs.length > 1 && (
                      <span className="text-muted-foreground">
                        {" "}
                        › {t.title}
                      </span>
                    )}
                  </span>
                </CommandItem>
              )),
            )}
          </CommandGroup>
          {mode !== "standalone" && (
            <CommandGroup heading="DevTools">
              {mode === "docked" && (
                <>
                  <CommandItem
                    value="dock to bottom"
                    onSelect={run(() => shell.setDock("bottom"))}
                  >
                    <PanelBottom />
                    Dock to bottom
                  </CommandItem>
                  <CommandItem
                    value="dock to right"
                    onSelect={run(() => shell.setDock("right"))}
                  >
                    <PanelRight />
                    Dock to right
                  </CommandItem>
                </>
              )}
              <CommandItem
                value="open standalone page"
                onSelect={run(links.openStandalone)}
              >
                <ExternalLink />
                Open standalone
              </CommandItem>
              <CommandItem
                value="close devtools"
                onSelect={run(() => shell.setOpen(false))}
              >
                <X />
                Close DevTools
                <CommandShortcut>{toggleShortcutLabel()}</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
