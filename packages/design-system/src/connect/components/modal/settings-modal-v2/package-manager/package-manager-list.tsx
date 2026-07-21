import { Icon } from "#design-system";
import type {
  RegistryPackage,
  RegistryPackageList,
} from "@powerhousedao/shared/registry";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { ConnectDropdownMenu } from "../../../dropdown-menu/dropdown-menu.js";
import { buildPackageSpec } from "./parse-package-spec.js";
import type { VersionSelection } from "./version-picker.js";
import {
  VersionPicker,
  resolveDefaultVersionSelection,
} from "./version-picker.js";

const PackageDetail: React.FC<{ label: string; value: ReactNode }> = ({
  label,
  value,
}) => {
  return (
    <div className="flex items-start gap-2 text-sm">
      <p className="text-foreground">{label}:</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
};

export const PackageManagerListItem = (props: {
  registryPackage: RegistryPackage;
  onInstall: (packageSpec: string) => Promise<void>;
  onUninstall: (packageName: string) => void;
  /**
   * Tag/version typed in the search query (`pkg@dev`) — preselects the
   * matching entry in the version picker.
   */
  preferredTag?: string;
  className?: string;
}) => {
  const { registryPackage, onInstall, onUninstall, preferredTag, className } =
    props;
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);

  const canPickVersion =
    registryPackage.status === "available" ||
    registryPackage.status === "dismissed";
  const hasVersionMetadata =
    (registryPackage.distTags &&
      Object.keys(registryPackage.distTags).length > 0) ||
    (registryPackage.versions?.length ?? 0) > 0;

  const [selected, setSelected] = useState<VersionSelection>(() =>
    resolveDefaultVersionSelection({
      distTags: registryPackage.distTags,
      versions: registryPackage.versions,
      version: registryPackage.version,
      preferredTag,
    }),
  );

  // Re-sync when the typed tag changes (e.g. user edits the search query).
  // Typing `pkg@dev` pre-selects the `dev` chip on matching rows.
  useEffect(() => {
    if (!preferredTag) return;
    if (registryPackage.distTags && preferredTag in registryPackage.distTags) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected({ kind: "tag", value: preferredTag });
    } else if (registryPackage.versions?.includes(preferredTag)) {
      setSelected({ kind: "version", value: preferredTag });
    }
  }, [preferredTag, registryPackage.distTags, registryPackage.versions]);

  const installDropdownItem = {
    id: "install",
    label: "Install",
    icon: <Icon name="DownloadFile" />,
    className: "text-foreground",
  } as const;

  const uninstallDropdownItem = {
    id: "uninstall",
    label: "Uninstall",
    icon: <Icon name="Trash" />,
    className: "text-destructive",
  } as const;

  function getDropdownItems() {
    return [
      canPickVersion ? installDropdownItem : undefined,
      registryPackage.status === "registry-install"
        ? uninstallDropdownItem
        : undefined,
    ].filter((item) => item !== undefined);
  }

  const dropdownItems = getDropdownItems();
  return (
    <li
      className={twMerge(
        "relative flex flex-col items-start rounded-md border border-border bg-background p-3 text-sm/5 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 pr-8">
        <h3 className="font-semibold text-foreground">
          {registryPackage.name}
        </h3>
        {canPickVersion && hasVersionMetadata ? (
          <VersionPicker
            distTags={registryPackage.distTags}
            versions={registryPackage.versions}
            selected={selected}
            onChange={setSelected}
          />
        ) : registryPackage.version ? (
          <span className="text-xs font-normal text-muted-foreground">
            v{registryPackage.version}
          </span>
        ) : null}
      </div>
      {registryPackage.manifest !== null &&
        (() => {
          const { description, category, publisher } = registryPackage.manifest;
          const publisherName = publisher?.name;
          const publisherUrl = publisher?.url;
          // Treat empty / whitespace-only strings as absent so we don't render
          // bare "Description:" / "Category:" labels with no value.
          const hasText = (value: string | null | undefined): boolean =>
            typeof value === "string" && value.trim() !== "";
          const showDescription = hasText(description);
          const showCategory = hasText(category);
          const showPublisher = hasText(publisherName);
          const showPublisherUrl = hasText(publisherUrl);
          if (
            !showDescription &&
            !showCategory &&
            !showPublisher &&
            !showPublisherUrl
          ) {
            return null;
          }
          return (
            <>
              {showDescription && (
                <PackageDetail label="Description" value={description} />
              )}
              {showCategory && (
                <PackageDetail label="Category" value={category} />
              )}
              {showPublisher && (
                <PackageDetail label="Publisher" value={publisherName} />
              )}
              {showPublisherUrl && (
                <PackageDetail
                  label="Publisher URL"
                  value={
                    <a className="underline" href={publisherUrl}>
                      {publisherUrl}
                    </a>
                  }
                />
              )}
            </>
          );
        })()}
      {dropdownItems.length > 0 && (
        <ConnectDropdownMenu
          items={dropdownItems}
          onItemClick={(id) => {
            if (id === "install") {
              const spec =
                canPickVersion && hasVersionMetadata
                  ? buildPackageSpec(registryPackage.name, selected.value)
                  : registryPackage.name;
              onInstall(spec).catch(console.error);
              return;
            }
            onUninstall(registryPackage.name);
          }}
          onOpenChange={setIsDropdownMenuOpen}
          open={isDropdownMenuOpen}
        >
          <button
            className="group absolute top-3 right-3"
            onClick={(e) => {
              e.stopPropagation();
              setIsDropdownMenuOpen(true);
            }}
          >
            <Icon
              className="text-foreground group-hover:hover-effect"
              name="VerticalDots"
            />
          </button>
        </ConnectDropdownMenu>
      )}
    </li>
  );
};

/**
 * Scroll region shared by both Package Manager tab panels. Fills the space
 * the panel gives it and scrolls its overflow. This works because the tab
 * panel sits inside the settings content card, which has a bounded height
 * (`m-6 ... h-full flex-1 overflow-hidden`); the flex chain down to here is
 * unbroken (`min-h-0` + `flex-1`/`h-full` at every level), so no
 * viewport-measuring hack is needed.
 */
export const PackagePanelScrollArea: React.FC<{
  children: ReactNode;
  className?: string;
  /**
   * Called when the bottom sentinel scrolls into view (infinite scroll). Only
   * observed while a handler is provided — pass `undefined` to stop paging.
   */
  onReachEnd?: () => void;
}> = ({ children, className, onReachEnd }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Keep the latest handler without re-creating the observer each render
  // (the handler identity changes as loading/hasMore state updates).
  const onReachEndRef = useRef(onReachEnd);
  useEffect(() => {
    onReachEndRef.current = onReachEnd;
  });
  const hasHandler = onReachEnd !== undefined;

  useEffect(() => {
    if (!hasHandler) return;
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onReachEndRef.current?.();
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasHandler]);

  return (
    <div
      ref={scrollRef}
      // Scroller is full-bleed to the card's right and bottom edges
      // (PackageManager has no right/bottom padding). Content keeps pr-3/pb-3
      // so cards align with the search above and stay inset from the border;
      // the scrollbar sits in that outer strip.
      className={twMerge("min-h-0 flex-1 overflow-y-auto", className)}
    >
      <div className="pr-3 pb-3">{children}</div>
      {hasHandler && (
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      )}
    </div>
  );
};

export const PackageSubSection: React.FC<{
  title: string;
  count: number;
  children: ReactNode;
}> = ({ title, count, children }) => {
  return (
    <div>
      <h4 className="mb-2 flex items-baseline gap-2 text-xs font-semibold tracking-wide text-foreground uppercase">
        <span>{title}</span>
        <span className="font-medium tracking-normal text-muted-foreground normal-case">
          ({count})
        </span>
      </h4>
      {children}
    </div>
  );
};

export const PackageList: React.FC<{
  packages: RegistryPackageList;
  onInstall: (packageSpec: string) => Promise<void>;
  onUninstall: (packageName: string) => void;
  preferredTag?: string;
}> = ({ packages, onInstall, onUninstall, preferredTag }) => {
  return (
    <ul className="flex flex-col items-stretch gap-4">
      {packages.map((pkg) => (
        <PackageManagerListItem
          key={pkg.name}
          registryPackage={pkg}
          onInstall={onInstall}
          onUninstall={onUninstall}
          preferredTag={preferredTag}
        />
      ))}
    </ul>
  );
};
