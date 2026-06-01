import { cloneElement, forwardRef, useMemo, useRef } from "react";
import { twMerge } from "tailwind-merge";
import CaretDown from "../../../../powerhouse/components/icon-components/CaretDown.js";
import Pin from "../../../../powerhouse/components/icon-components/Pin.js";
import PinFilled from "../../../../powerhouse/components/icon-components/PinFilled.js";
import { Tooltip, TooltipProvider } from "../../tooltip/tooltip.js";
import { type FlattenedNode, NodeStatus, type SidebarNode } from "../types.js";
import { useEllipsis } from "../use-ellipsis.js";
import { StatusIcon } from "./status-icon.js";
import { Icon } from "../../../../powerhouse/index.js";

interface SidebarItemProps {
  node: FlattenedNode;
  toggleNode?: (nodeId: string) => void;
  togglePin: (nodeId: string) => void;
  searchTerm: string;
  searchResults: SidebarNode[];
  activeSearchIndex: number;
  allowPinning: boolean;
  pinnedMode?: boolean;
  isPinned?: boolean;
  isActive?: boolean;
  style?: React.CSSProperties;
  onChange?: (node: SidebarNode) => void;
}

const TOOLTIP_DELAY = 700;
const TOOLTIP_DELAY_LONG = 172800000; // 2 days to simulate no tooltip

export const SidebarItem = ({
  node,
  toggleNode,
  togglePin,
  searchTerm,
  searchResults,
  activeSearchIndex,
  allowPinning,
  pinnedMode = false,
  isPinned = false,
  isActive = false,
  style,
  onChange,
}: SidebarItemProps) => {
  const paddingLeft = node.depth * 24;
  const isSearchActive =
    searchResults.length > 0 && searchResults[activeSearchIndex].id === node.id;
  const IconComponent = node.isExpanded
    ? (node.expandedIcon ?? node.icon)
    : node.icon;
  const isDescendenceModified = useMemo(() => {
    const check = (n: SidebarNode): boolean => {
      // Check current node's status first
      if (n.status !== NodeStatus.UNCHANGED && n.status) {
        return true;
      }

      // Then recursively check all children
      if (n.children && n.children.length > 0) {
        return n.children.some((child) => check(child));
      }

      return false;
    };

    return check(node);
  }, [node]);
  const hasStatus =
    (node.status && node.status !== NodeStatus.UNCHANGED) ||
    isDescendenceModified;

  const computedStyle = { ...style, paddingLeft };

  // Check if the title has ellipsis to determine if the tooltip should be delayed
  const ellipsisRef = useRef<HTMLDivElement | null>(null);
  const hasEllipsis = useEllipsis(ellipsisRef);

  return (
    <TooltipProvider>
      <Tooltip
        content={node.title}
        triggerAsChild
        side="bottom"
        delayDuration={hasEllipsis ? TOOLTIP_DELAY : TOOLTIP_DELAY_LONG}
      >
        <div
          style={computedStyle}
          className={twMerge(
            "group/sidebar-item-wrapper flex w-full items-center",
            !pinnedMode && "pb-2",
          )}
        >
          <div
            tabIndex={0}
            data-testid="sidebar-item"
            id={`sidebar-item-${node.id}`}
            className={twMerge(
              "group/sidebar-item relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-gray-700 select-none hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-900",
              hasStatus && "pr-6",
              allowPinning && (hasStatus ? "hover:pr-12" : "hover:pr-6"),
              isPinned && (hasStatus ? "pr-12" : "pr-6"),
              isSearchActive && "bg-yellow-100 dark:bg-[#604B0033]",
              // line between pinned items
              pinnedMode &&
                "after:absolute after:-top-2.5 after:left-[15px] after:h-4 after:w-px after:bg-gray-300 first:group-first/sidebar-item-wrapper:after:hidden hover:bg-gray-50 dark:hover:bg-slate-600",
              isActive &&
                "bg-gray-200 font-medium text-gray-900 hover:bg-gray-200 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900",
              node.className,
            )}
            onClick={() => {
              toggleNode?.(node.id);
              onChange?.(node);
            }}
          >
            <div className="flex max-w-full items-center gap-2">
              {!pinnedMode && (
                <div
                  className="-m-2 -mr-1 h-full rounded-md py-2 pr-1 pl-2 hover:bg-gray-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNode?.(node.id);
                  }}
                >
                  <CaretDown
                    width="16"
                    height="16"
                    className={twMerge(
                      "min-w-4",
                      node.isExpanded &&
                        node.children &&
                        node.children.length > 0
                        ? ""
                        : "-rotate-90",
                      node.children === undefined || node.children.length === 0
                        ? "text-gray-300 dark:text-slate-700"
                        : "text-gray-700 dark:text-slate-400",
                    )}
                  />
                </div>
              )}

              {IconComponent ? (
                typeof IconComponent === "string" ? (
                  <Icon name={IconComponent} size={16} className="min-w-4" />
                ) : (
                  // @ts-expect-error -- this is a workaround
                  cloneElement(IconComponent, { className: "min-w-4 w-4" })
                )
              ) : pinnedMode ? (
                <PinnedModeCircleIcon isPinned={isPinned} />
              ) : null}

              <RenderTitle
                ref={ellipsisRef}
                title={node.title}
                searchTerm={searchTerm}
                isSearchActive={isSearchActive}
                pinnedMode={pinnedMode}
                className=""
              />

              {allowPinning && (
                <div
                  className={twMerge(
                    "absolute top-1/2 flex -translate-y-1/2 items-center justify-center",
                    hasStatus ? "right-8" : "right-2",
                    isPinned
                      ? "text-gray-700 hover:text-blue-900 dark:text-slate-50 dark:hover:text-blue-900"
                      : "invisible text-gray-300 group-hover/sidebar-item:visible hover:text-gray-700 dark:text-slate-700 dark:hover:text-slate-50",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(node.id);
                  }}
                >
                  {isPinned ? (
                    <PinFilled width="16" height="16" />
                  ) : (
                    <Pin width="16" height="16" />
                  )}
                </div>
              )}
              {hasStatus && (
                <div
                  className={twMerge(
                    "absolute top-1/2 right-2 flex -translate-y-1/2 items-center justify-center",
                    "text-gray-300 group-hover/sidebar-item:visible hover:text-gray-700 dark:text-slate-700 dark:hover:text-slate-50",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(node.id);
                  }}
                >
                  <StatusIcon
                    status={node.status ?? NodeStatus.UNCHANGED}
                    isDescendenceModified={isDescendenceModified}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </Tooltip>
    </TooltipProvider>
  );
};

const RenderTitle = forwardRef<
  HTMLDivElement,
  {
    title: string;
    searchTerm: string;
    isSearchActive: boolean;
    pinnedMode: boolean;
    className?: string;
  }
>(({ title, searchTerm, isSearchActive, pinnedMode, className }, ref) => {
  return (
    <div ref={ref} className={twMerge("truncate text-sm/5", className)}>
      {searchTerm &&
      title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !pinnedMode
        ? (() => {
            const highlightClass = isSearchActive
              ? "bg-yellow-300 dark:bg-[#604B00]"
              : "bg-gray-300 dark:bg-slate-800";
            const parts: React.ReactNode[] = [];
            let remaining = title;
            const lowerTerm = searchTerm.toLowerCase();
            let i = 0;
            while (remaining.length > 0) {
              const idx = remaining.toLowerCase().indexOf(lowerTerm);
              if (idx === -1) {
                parts.push(remaining);
                break;
              }
              if (idx > 0) parts.push(remaining.slice(0, idx));
              parts.push(
                <span key={i++} className={highlightClass}>
                  {remaining.slice(idx, idx + searchTerm.length)}
                </span>,
              );
              remaining = remaining.slice(idx + searchTerm.length);
            }
            return <>{parts}</>;
          })()
        : title}
    </div>
  );
});

RenderTitle.displayName = "RenderTitle";

const PinnedModeCircleIcon = ({ isPinned }: { isPinned: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="min-w-4"
  >
    <rect width="16" height="16" rx="6.4" fill="transparent" />
    <path
      d="M12 8C12 10.2091 10.2091 12 8 12C5.79086 12 4 10.2091 4 8C4 5.79086 5.79086 4 8 4C10.2091 4 12 5.79086 12 8Z"
      fill="currentColor"
      className={
        isPinned
          ? "text-gray-500 dark:text-slate-500"
          : "text-gray-300 dark:text-slate-300"
      }
    />
  </svg>
);
