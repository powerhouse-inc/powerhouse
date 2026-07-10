import { PackageAnimation } from "#design-system";
import type { RegistryPackageList } from "@powerhousedao/shared/registry";
import { filterPackages } from "./filter-packages.js";
import { NpmFallbackRow } from "./npm-fallback-row.js";
import { isPlausiblePackageName } from "./npm-name.js";
import {
  PackageList,
  PackagePanelScrollArea,
  PackageSubSection,
} from "./package-manager-list.js";
import { PackageRegistryError } from "./package-registry-error.js";
import { PackageSearchInput } from "./package-search-input.js";
import { parsePackageSpec } from "./parse-package-spec.js";

export type AvailablePackagesPanelProps = {
  /**
   * status: available | dismissed. In server-search mode these are already
   * filtered by the registry; otherwise they're filtered client-side here.
   */
  packages: RegistryPackageList;
  /**
   * Bare names of installed packages — suppresses the npm-fallback row for
   * packages the user already has (they live on the Installed tab).
   */
  installedNames: string[];
  query: string;
  onQueryChange: (query: string) => void;
  /**
   * When true, `packages` is already server-filtered for `query` — skip the
   * client-side `filterPackages`. Set by the connect layer once the paginated
   * search endpoint is wired.
   */
  serverSearch?: boolean;
  /** true while the first page / a new search is loading. */
  isLoading?: boolean;
  /** true while an additional page is being appended (infinite scroll). */
  isLoadingMore?: boolean;
  /** more pages exist on the server. */
  hasMore?: boolean;
  /** request the next page (infinite scroll). */
  onLoadMore?: () => void;
  /**
   * Registry fetch failed. Presence-only — the panel never surfaces raw API
   * messages; see `PackageRegistryError` for the user-facing copy.
   */
  error?: boolean;
  /** retry the current fetch after an error. */
  onRetry?: () => void;
  mutable: boolean;
  onInstall: (packageSpec: string) => Promise<void>;
  onUninstall: (packageName: string) => void;
  disabled?: boolean;
};

const LoadingRow: React.FC<{ label: string; center?: boolean }> = ({
  label,
  center,
}) => (
  <div
    className={`flex items-center gap-2 text-sm text-muted-foreground ${
      center ? "justify-center" : ""
    }`}
  >
    <PackageAnimation animate loop color="#6b7280" size={24} />
    <span>{label}</span>
  </div>
);

export const AvailablePackagesPanel: React.FC<AvailablePackagesPanelProps> = (
  props,
) => {
  const {
    packages,
    installedNames,
    query,
    onQueryChange,
    serverSearch,
    isLoading,
    isLoadingMore,
    hasMore,
    onLoadMore,
    error,
    onRetry,
    mutable,
    onInstall,
    onUninstall,
    disabled,
  } = props;

  const filtered = serverSearch ? packages : filterPackages(packages, query);
  const available = filtered.filter((p) => p.status === "available");
  const dismissed = filtered.filter((p) => p.status === "dismissed");

  const { name: queryName, tag: queryTag } = parsePackageSpec(query);
  const showNpmFallback =
    mutable &&
    filtered.length === 0 &&
    isPlausiblePackageName(queryName) &&
    !installedNames.includes(queryName);

  const isEmpty = filtered.length === 0;
  // Pagination is active when the caller wired an infinite-scroll handler.
  const paginated = onLoadMore !== undefined;

  function renderContent() {
    // First load / new search with nothing to show yet → spinner only.
    if (isEmpty && isLoading) {
      return <LoadingRow label="Loading packages…" center />;
    }
    // Fetch failed and we have nothing cached → error + retry.
    if (isEmpty && error) {
      return <PackageRegistryError variant="empty" onRetry={onRetry} />;
    }
    if (isEmpty) {
      if (showNpmFallback) {
        return (
          <NpmFallbackRow
            query={query}
            onInstall={onInstall}
            disabled={disabled}
          />
        );
      }
      return (
        <p className="text-sm text-foreground">
          {query
            ? "No packages match your search."
            : "No packages available to install."}
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        {available.length > 0 && (
          <PackageList
            packages={available}
            onInstall={onInstall}
            onUninstall={onUninstall}
            preferredTag={queryTag}
          />
        )}
        {dismissed.length > 0 && (
          <PackageSubSection title="Dismissed" count={dismissed.length}>
            <PackageList
              packages={dismissed}
              onInstall={onInstall}
              onUninstall={onUninstall}
              preferredTag={queryTag}
            />
          </PackageSubSection>
        )}
        {isLoadingMore && <LoadingRow label="Loading more…" center />}
        {/* Infinite-scroll exhausted: let the user know there's nothing more. */}
        {paginated && !hasMore && !isLoadingMore && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            You&rsquo;ve reached the end of the list.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="pr-3">
        <PackageSearchInput
          value={query}
          onChange={onQueryChange}
          placeholder="Search available packages"
          disabled={disabled}
        />
        {/* Non-empty background refresh: keep the list, show a slim indicator. */}
        {!isEmpty && isLoading && (
          <div className="mt-3">
            <LoadingRow label="Refreshing packages…" />
          </div>
        )}
        {/* Non-empty error: keep the list, show a friendly refresh banner. */}
        {!isEmpty && error && (
          <div className="mt-3">
            <PackageRegistryError variant="refresh" onRetry={onRetry} />
          </div>
        )}
      </div>
      <PackagePanelScrollArea
        onReachEnd={hasMore && onLoadMore ? onLoadMore : undefined}
      >
        {renderContent()}
      </PackagePanelScrollArea>
    </div>
  );
};
