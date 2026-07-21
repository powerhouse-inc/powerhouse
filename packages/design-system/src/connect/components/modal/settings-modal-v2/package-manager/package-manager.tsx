import type { RegistryPackageList } from "@powerhousedao/shared/registry";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { TabContent } from "../../../tabs/tab-content.js";
import { Tabs } from "../../../tabs/tabs.js";
import { AvailablePackagesPanel } from "./available-packages-panel.js";
import { InstalledPackagesPanel } from "./installed-packages-panel.js";

export type PackageManagerProps = {
  /** status: local-install | registry-install */
  installedPackages: RegistryPackageList;
  /** status: available | dismissed (dismissed grouped at the bottom) */
  availablePackages: RegistryPackageList;
  /** true while the first page / a new search is loading. */
  isAvailableLoading?: boolean;
  /** true while an additional page is being appended (infinite scroll). */
  isLoadingMoreAvailable?: boolean;
  /** more Available pages exist on the server. */
  hasMoreAvailable?: boolean;
  /** request the next Available page (infinite scroll). */
  onLoadMoreAvailable?: () => void;
  /**
   * Registry Available fetch failed. Presence-only — never pass raw API
   * messages; the panel renders friendly copy via `PackageRegistryError`.
   */
  availableError?: boolean;
  /** retry the Available fetch after an error. */
  onAvailableRetry?: () => void;
  /**
   * When provided, Available search is delegated to the server (the panel
   * skips client-side filtering). Called with the query on every keystroke.
   */
  onAvailableSearchChange?: (query: string) => void;
  mutable: boolean;
  /**
   * Install handler. The argument is the full spec the user chose — either
   * the bare package name, or `name@tag` / `name@version` when they typed
   * a suffix in the search input or picked one via the version picker.
   */
  onInstall: (packageSpec: string) => Promise<void>;
  onUninstall: (packageName: string) => void;
  /**
   * Fired on every activation of the Available tab (including an initial
   * `initialTab="available"` mount). The caller dedupes — this is what
   * makes the registry fetch lazy.
   */
  onAvailableTabOpen?: () => void;
  /** default "installed"; used by stories/tests */
  initialTab?: "installed" | "available";
  disabled?: boolean;
  className?: string;
};

export const PackageManager: React.FC<PackageManagerProps> = (props) => {
  const {
    installedPackages,
    availablePackages,
    isAvailableLoading,
    isLoadingMoreAvailable,
    hasMoreAvailable,
    onLoadMoreAvailable,
    availableError,
    onAvailableRetry,
    onAvailableSearchChange,
    onInstall,
    onUninstall,
    onAvailableTabOpen,
    initialTab = "installed",
    mutable,
    disabled,
    className,
  } = props;

  // Search queries live here, not in the panels: Radix unmounts inactive tab
  // content, and lifting the Available query also readies it for the future
  // registry search endpoint.
  const [installedQuery, setInstalledQuery] = useState("");
  const [availableQuery, setAvailableQuery] = useState("");

  // Tab switches are event-driven via onValueChange; this effect only covers
  // the case where the Available tab is the initial one (stories/tests), which
  // Radix never reports.
  useEffect(() => {
    if (initialTab === "available") onAvailableTabOpen?.();
    // Fire once on mount — re-running on callback identity changes would
    // defeat the "on activation" semantics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installedNames = installedPackages.map((p) => p.name);

  return (
    <div
      className={twMerge(
        // No right/bottom padding — the scroll area must reach those card
        // edges so the scrollbar sits flush; header/search/cards share pr-3
        // and the scroll content keeps pb-3 for bottom inset.
        "flex min-h-0 flex-1 flex-col rounded-lg bg-background pt-3 pl-3 text-foreground",
        className,
      )}
    >
      <h2 className="mb-4 shrink-0 pr-3 font-semibold text-foreground">
        Packages
      </h2>
      <Tabs
        defaultValue={initialTab}
        listClassName="pr-3"
        onValueChange={(value) => {
          if (value === "available") onAvailableTabOpen?.();
        }}
      >
        <TabContent
          value="installed"
          label={`Installed (${installedPackages.length})`}
        >
          <InstalledPackagesPanel
            packages={installedPackages}
            query={installedQuery}
            onQueryChange={setInstalledQuery}
            onInstall={onInstall}
            onUninstall={onUninstall}
            disabled={disabled}
          />
        </TabContent>
        <TabContent value="available" label="Available">
          <AvailablePackagesPanel
            packages={availablePackages}
            installedNames={installedNames}
            query={availableQuery}
            onQueryChange={(q) => {
              // Local state keeps the input responsive; the parent (when
              // server search is wired) debounces and refetches.
              setAvailableQuery(q);
              onAvailableSearchChange?.(q);
            }}
            serverSearch={onAvailableSearchChange !== undefined}
            isLoading={isAvailableLoading}
            isLoadingMore={isLoadingMoreAvailable}
            hasMore={hasMoreAvailable}
            onLoadMore={onLoadMoreAvailable}
            error={availableError}
            onRetry={onAvailableRetry}
            mutable={mutable}
            onInstall={onInstall}
            onUninstall={onUninstall}
            disabled={disabled}
          />
        </TabContent>
      </Tabs>
    </div>
  );
};
