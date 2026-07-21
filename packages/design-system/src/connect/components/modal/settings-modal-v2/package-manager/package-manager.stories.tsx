import type { Meta, StoryObj } from "@storybook/react";

import type { RegistryPackage } from "@powerhousedao/shared/registry";
import { useMemo, useRef, useState } from "react";
import { mockPackages } from "../mocks.js";
import { PackageManager } from "./package-manager.js";
import { parsePackageSpec } from "./parse-package-spec.js";

const mixedStatusPackages: RegistryPackage[] = mockPackages.map((pkg, i) => {
  if (i === 0) return { ...pkg, status: "local-install" };
  if (i === 1 || i === 2) return { ...pkg, status: "registry-install" };
  if (i === 3) return { ...pkg, status: "dismissed" };
  return pkg;
});

// A large mixed list to exercise the scroll region on both tabs.
const manyPackages: RegistryPackage[] = Array.from({ length: 4 }, (_, batch) =>
  mockPackages.map((pkg, i) => ({
    ...pkg,
    name: batch === 0 ? pkg.name : `${pkg.name}-${batch}`,
    status: (i + batch) % 3 === 0 ? "registry-install" : pkg.status,
  })),
).flat();

// Packages with dist-tag + version metadata so the `name@tag` search path
// has something meaningful to resolve against.
const taggedPackages: RegistryPackage[] = [
  {
    ...mockPackages[0],
    status: "available",
    version: "2.4.1",
    distTags: { latest: "2.4.1", staging: "2.5.0-staging.1" },
    versions: ["1.0.0", "2.0.0", "2.4.1", "2.5.0-staging.1"],
  },
  {
    ...mockPackages[1],
    status: "available",
    version: "1.2.3",
    distTags: { latest: "1.2.3" },
    versions: ["1.0.0", "1.2.3"],
  },
  {
    ...mockPackages[2],
    status: "available",
    version: "0.9.0",
    distTags: { latest: "0.9.0", dev: "1.0.0-dev.4" },
    versions: ["0.5.0", "0.9.0", "1.0.0-dev.4"],
  },
  {
    ...mockPackages[3],
    status: "available",
    version: "3.0.0",
    distTags: {
      latest: "3.0.0",
      dev: "3.1.0-dev.2",
      staging: "3.1.0-staging.1",
    },
    versions: ["2.0.0", "3.0.0", "3.1.0-dev.2", "3.1.0-staging.1"],
  },
  {
    ...mockPackages[4],
    status: "available",
    version: "0.1.0",
    // No dist-tags — covers the "package without metadata" path.
  },
];

const meta: Meta<typeof PackageManager> = {
  title: "Connect/Components/PackageManager",
  component: PackageManager,
  excludeStories: ["PackageManagerWrapper"],
};

export default meta;
type Story = StoryObj<typeof meta>;

type WrapperProps = {
  packages?: RegistryPackage[];
  /**
   * false (default) simulates a cold localStorage cache: the Available tab
   * shows nothing until the simulated fetch resolves. true simulates a warm
   * cache: rows render immediately and opening the tab shows the refresh
   * indicator above them.
   */
  cached?: boolean;
  /** Simulated GET /packages latency. */
  fetchDelayMs?: number;
  /** When true, the simulated fetch fails (no raw API message is shown). */
  fetchError?: boolean;
  mutable?: boolean;
  disabled?: boolean;
  initialTab?: "installed" | "available";
};

const STORY_PAGE_SIZE = 3;

export function PackageManagerWrapper(props: WrapperProps = {}) {
  const {
    packages: initialPackages = mixedStatusPackages,
    cached = false,
    fetchDelayMs = 800,
    fetchError,
    mutable = true,
    disabled,
    initialTab,
  } = props;
  const [packages, setPackages] = useState(initialPackages);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(
    cached ? STORY_PAGE_SIZE : 0,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Cached + fetchError → show the refresh banner over an already-loaded list.
  const [error, setError] = useState(Boolean(cached && fetchError));
  const loadedRef = useRef(cached);

  // Server-side view: available|dismissed, filtered by the (server) query.
  const serverAvailable = useMemo(() => {
    const base = packages.filter(
      (p) => p.status === "available" || p.status === "dismissed",
    );
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.manifest?.description?.toLowerCase().includes(q),
    );
  }, [packages, query]);

  const availablePackages = serverAvailable.slice(0, visibleCount);
  const hasMore = visibleCount < serverAvailable.length;

  function loadFirstPage() {
    setIsLoading(true);
    setError(false);
    setTimeout(() => {
      setIsLoading(false);
      if (fetchError) {
        setError(true);
      } else {
        setVisibleCount(STORY_PAGE_SIZE);
        loadedRef.current = true;
      }
    }, fetchDelayMs);
  }

  function ensureAvailableLoaded() {
    if (loadedRef.current || isLoading || error) return;
    loadFirstPage();
  }

  function handleSearch(q: string) {
    setQuery(q);
    setVisibleCount(0);
    setIsLoading(true);
    setError(false);
    setTimeout(() => {
      setIsLoading(false);
      if (fetchError) {
        setError(true);
      } else {
        setVisibleCount(STORY_PAGE_SIZE);
      }
    }, fetchDelayMs);
  }

  function loadMore() {
    if (!hasMore || isLoading || isLoadingMore) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setIsLoadingMore(false);
      setVisibleCount((c) => c + STORY_PAGE_SIZE);
    }, fetchDelayMs);
  }

  function handleInstall(packageSpec: string) {
    const { name } = parsePackageSpec(packageSpec);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setPackages((prev) => {
          const existing = prev.find((p) => p.name === name);
          if (existing) {
            return prev.map((p) =>
              p.name === name
                ? { ...p, status: "registry-install" as const }
                : p,
            );
          }
          // npm fallback: register a minimal entry, like the real app does.
          return [
            ...prev,
            {
              name,
              path: "/stub-path",
              documentTypes: [],
              manifest: null,
              status: "registry-install" as const,
            },
          ];
        });
        console.log("Installed:", packageSpec);
        resolve();
      }, 800);
    });
  }

  function handleUninstall(packageName: string) {
    setPackages((prev) =>
      prev.map((p) =>
        p.name === packageName ? { ...p, status: "available" as const } : p,
      ),
    );
    console.log("Uninstalled:", packageName);
  }

  const installedPackages = packages.filter(
    (p) => p.status === "local-install" || p.status === "registry-install",
  );

  return (
    <PackageManager
      installedPackages={installedPackages}
      availablePackages={availablePackages}
      isAvailableLoading={isLoading}
      isLoadingMoreAvailable={isLoadingMore}
      hasMoreAvailable={hasMore}
      onLoadMoreAvailable={loadMore}
      availableError={error}
      onAvailableRetry={loadFirstPage}
      onAvailableSearchChange={handleSearch}
      onAvailableTabOpen={ensureAvailableLoaded}
      onInstall={handleInstall}
      onUninstall={handleUninstall}
      mutable={mutable}
      disabled={disabled}
      initialTab={initialTab}
    />
  );
}

function makeStory(wrapperProps: WrapperProps = {}): Story {
  return {
    render: () => <PackageManagerWrapper {...wrapperProps} />,
  };
}

/**
 * Opens on the Installed tab (the default). Switching to the Available tab
 * triggers the simulated first-page fetch.
 */
export const Default: Story = makeStory();

/**
 * Opening the Available tab loads the first page (brief spinner, then rows).
 * Typing in the search box re-queries the server; scrolling loads more.
 */
export const AvailableTab: Story = makeStory({ initialTab: "available" });

/** First page already loaded — rows render immediately. */
export const AvailablePreloaded: Story = makeStory({
  initialTab: "available",
  cached: true,
});

/** First page still in flight: the loading row is the only feedback. */
export const AvailableLoadingFirstPage: Story = makeStory({
  initialTab: "available",
  fetchDelayMs: 1_000_000,
});

/** The registry fetch failed with nothing cached: friendly error + Try again. */
export const AvailableError: Story = makeStory({
  initialTab: "available",
  fetchError: true,
});

/** Refresh failed but previously loaded packages remain visible. */
export const AvailableRefreshError: Story = makeStory({
  initialTab: "available",
  cached: true,
  fetchError: true,
});

/**
 * Many available packages paged 3 at a time — scroll to the bottom to trigger
 * infinite loading (a "Loading more…" row appears between pages).
 */
export const AvailableInfiniteScroll: Story = {
  ...makeStory({
    packages: manyPackages,
    initialTab: "available",
    cached: true,
    fetchDelayMs: 600,
  }),
  decorators: [
    (Story) => (
      <div className="h-[600px]">
        <Story />
      </div>
    ),
  ],
};

/** Dismissed packages are grouped at the bottom of the Available tab. */
export const WithDismissed: Story = makeStory({
  initialTab: "available",
  cached: true,
});

/**
 * The Available tab shows an "Install from npm" fallback row when the typed
 * query is a plausible package name that doesn't match anything in the
 * registry. Covers the case where the user wants to pull an npm-only package
 * through the registry's uplink.
 *
 * Try typing `react-markdown` or `lodash` — the fallback row appears (the
 * mock list doesn't contain those names). Typing `my-pkg@dev` installs that
 * exact spec.
 */
export const NpmFallback: Story = makeStory({
  packages: taggedPackages,
  initialTab: "available",
  cached: true,
});

/**
 * Available packages carrying dist-tags + version metadata. Each row exposes
 * a version picker (defaulting to `latest`) so users can pick a tag or a
 * specific version. Typing `my-pkg@dev` in the search pre-selects the
 * matching tag on filtered rows.
 */
export const WithTaggedPackages: Story = {
  ...makeStory({
    packages: taggedPackages,
    initialTab: "available",
    cached: true,
  }),
  decorators: [
    (Story) => (
      <div className="h-[700px]">
        <Story />
      </div>
    ),
  ],
};

export const Immutable: Story = makeStory({ mutable: false });

export const Empty: Story = makeStory({ packages: [], cached: true });

export const WithManyPackages: Story = {
  ...makeStory({ packages: manyPackages, cached: true }),
  decorators: [
    (Story) => (
      <div className="h-[600px]">
        <Story />
      </div>
    ),
  ],
};
