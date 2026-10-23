import { Icon } from "@powerhousedao/design-system";

/** Class of the shell's loader; scripts/prerender-shell.ts fades it in. */
export const SHELL_LOADER_CLASS = "ph-shell-loader";

// The static shell's "starting" state: a pulsing Powerhouse logo, CSS only.
export function ShellLoader() {
  return (
    <div
      role="status"
      aria-label="Starting Connect"
      className={`${SHELL_LOADER_CLASS} pointer-events-none fixed inset-0 z-10 flex items-center justify-center`}
    >
      {/* data-ph-loader-slot: a project build swaps this logo for its own
          loader (connect.branding.loader). */}
      <div
        data-ph-loader-slot=""
        className="animate-pulse rounded-full bg-background p-4 text-foreground shadow-lg motion-reduce:animate-none"
      >
        <Icon name="ConnectSmall" size={40} />
      </div>
    </div>
  );
}

// Core's "starting" state: a small neutral spinner, no logo. The project's
// loader (connect.branding.loader) is Connect-level branding, so a project
// build swaps the spinner for it here too.
export function CoreShellLoader() {
  return (
    <div
      role="status"
      aria-label="Starting"
      className={`${SHELL_LOADER_CLASS} pointer-events-none fixed inset-0 z-10 flex items-center justify-center`}
    >
      <div
        data-ph-loader-slot=""
        className="size-5 animate-spin rounded-full border-2 border-core-border border-t-core-muted motion-reduce:animate-none"
      />
    </div>
  );
}
