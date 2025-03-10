import { type SidebarNode, type FlattenedNode, NodeStatus } from "../types";
import { useCallback } from "react";
import { cn } from "@/scalars/lib";
import { Tooltip, TooltipProvider } from "../../fragments";
import { Icon } from "@/powerhouse";
import { StatusIcon } from "./status-icon";

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
  const iconName = node.isExpanded
    ? (node.expandedIcon ?? node.icon)
    : node.icon;
  const hasStatus = node.status && node.status !== NodeStatus.UNCHANGED;

  const handleClick = useCallback(() => {
    toggleNode?.(node.id);
    onChange?.(node);
  }, [onChange, node, toggleNode]);

  const handleTogglePin = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      togglePin(node.id);
    },
    [node.id, togglePin],
  );

  return (
    <TooltipProvider>
      <Tooltip
        content={node.title}
        triggerAsChild
        side="bottom"
        delayDuration={700}
      >
        <div
          style={{ ...style, paddingLeft }}
          className={cn(
            "group/sidebar-item-wrapper flex w-full items-center",
            !pinnedMode && "pb-2",
          )}
        >
          <div
            id={`sidebar-item-${node.id}`}
            className={cn(
              "group/sidebar-item dark:hover:bg-charcoal-900 relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-gray-700 hover:bg-gray-100 dark:text-gray-400",
              hasStatus && "pr-6",
              allowPinning && (hasStatus ? "hover:pr-12" : "hover:pr-6"),
              isPinned && (hasStatus ? "pr-12" : "pr-6"),
              isSearchActive && "bg-yellow-100 dark:bg-[#604B0033]",
              // line between pinned items
              pinnedMode &&
                "after:absolute after:-top-2.5 after:left-[15px] after:h-4 after:w-px after:bg-gray-300 hover:bg-gray-50 first:group-first/sidebar-item-wrapper:after:hidden dark:hover:bg-slate-600",
              isActive && "font-medium text-gray-900 dark:text-gray-50",
            )}
            onClick={handleClick}
          >
            <div className="flex max-w-full items-center gap-2">
              {!pinnedMode && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentcolor"
                  width="16"
                  height="16"
                  className={cn(
                    "min-w-4",
                    node.isExpanded && node.children && node.children.length > 0
                      ? ""
                      : "-rotate-90",
                    node.children === undefined || node.children.length === 0
                      ? "text-gray-300 dark:text-gray-700"
                      : "text-gray-700 dark:text-gray-400",
                  )}
                >
                  <path
                    d="M6 9L12 15L18 9"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}

              {iconName ? (
                <Icon name={iconName} size={16} className="min-w-4" />
              ) : pinnedMode ? (
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
                        ? "text-gray-500 dark:text-gray-500"
                        : "text-gray-300 dark:text-gray-300"
                    }
                  />
                </svg>
              ) : null}

              <div className="truncate text-sm leading-5">
                {node.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
                !pinnedMode ? (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: node.title.replace(
                        new RegExp(searchTerm, "gi"),
                        (match) =>
                          `<span class="${isSearchActive ? "bg-yellow-300 dark:bg-[#604B00]" : "bg-gray-300 dark:bg-charcoal-800"}">${match}</span>`,
                      ),
                    }}
                  />
                ) : (
                  node.title
                )}
              </div>

              {allowPinning && (
                <div
                  className={cn(
                    "absolute top-1/2 flex -translate-y-1/2 items-center justify-center",
                    hasStatus ? "right-8" : "right-2",
                    isPinned
                      ? "text-gray-700 hover:text-blue-900 dark:text-gray-50 dark:hover:text-blue-900"
                      : "invisible text-gray-300 hover:text-gray-700 group-hover/sidebar-item:visible dark:text-gray-700 dark:hover:text-gray-50",
                  )}
                  onClick={handleTogglePin}
                >
                  <Icon name={isPinned ? "PinFilled" : "Pin"} size={16} />
                </div>
              )}
              {node.status && hasStatus && (
                <div
                  className={cn(
                    "absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center",
                    "text-gray-300 hover:text-gray-700 group-hover/sidebar-item:visible dark:text-gray-700 dark:hover:text-gray-50",
                  )}
                  onClick={handleTogglePin}
                >
                  <StatusIcon status={node.status} />
                </div>
              )}
            </div>
          </div>
        </div>
      </Tooltip>
    </TooltipProvider>
  );
};
