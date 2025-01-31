/* eslint-disable react/jsx-max-depth */
"use client";

import { Icon, IconName } from "@/index";
import React, { KeyboardEventHandler, useCallback, useRef } from "react";
import type { SidebarNode } from "../types";
import { cn } from "@/scalars/lib";
import {
  useSidebar,
  useSidebarIsNodeActive,
  useSidebarIsNodeSearchActive,
  useSidebarItemPinned,
  useSidebarNodeState,
} from "./sidebar-provider";
import { Tooltip, TooltipProvider } from "../../fragments";

interface ItemProps {
  id: string;
  title: string;
  open?: boolean;
  pinnedMode?: boolean;
  allowPinning?: boolean;
  icon?: IconName;
  expandedIcon?: IconName;
}

export const Item: React.FC<ItemProps> = ({
  id,
  title,
  open,
  pinnedMode,
  allowPinning,
  icon,
  expandedIcon,
}) => {
  const textRef = useRef<HTMLDivElement>(null);
  const { togglePin, searchTerm, handleActiveNodeChange } = useSidebar();
  const isPinned = useSidebarItemPinned(id);
  const isSearchActive = useSidebarIsNodeSearchActive(id);
  const isActive = useSidebarIsNodeActive(id);

  const handleTogglePin = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation(); // prevent the accordion to change its open state
      togglePin(id);
    },
    [togglePin, id],
  );

  const handleClick = useCallback(() => {
    handleActiveNodeChange(id);
  }, [handleActiveNodeChange, id]);

  const iconName: IconName | undefined =
    open && expandedIcon ? expandedIcon : icon;

  return (
    <TooltipProvider>
      <Tooltip content={title} triggerAsChild side="bottom" delayDuration={700}>
        <div
          id={`sidebar-item-${id}`}
          tabIndex={0}
          className={cn(
            "group/sidebar-item dark:hover:bg-charcoal-900 relative flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-2 py-1.5 text-gray-700 hover:bg-gray-100 dark:text-gray-400",
            allowPinning && "hover:pr-6",
            isPinned && "pr-6",
            isSearchActive && "bg-yellow-100 dark:bg-[#604B0033]",
            // line between pinned items
            pinnedMode &&
              "after:absolute after:-top-2.5 after:left-[15px] after:h-4 after:w-px after:bg-gray-300 first:after:hidden",
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
                  "min-w-4 transition-all duration-300 ease-in-out",
                  open ? "" : "-rotate-90",
                  open === undefined
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

            <div ref={textRef} className="truncate text-sm leading-5">
              {title.toLowerCase().includes(searchTerm.toLowerCase()) &&
              !pinnedMode ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: title.replace(
                      new RegExp(searchTerm, "gi"),
                      (match) =>
                        `<span class="${isSearchActive ? "bg-yellow-300 dark:bg-[#604B00]" : "bg-gray-300 dark:bg-charcoal-800"}">${match}</span>`,
                    ),
                  }}
                />
              ) : (
                title
              )}
            </div>
          </div>

          <div
            className={cn(
              "absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center",
              isPinned
                ? "text-gray-700 hover:text-blue-900 dark:text-gray-50 dark:hover:text-blue-900"
                : "invisible text-gray-300 hover:text-gray-700 group-hover/sidebar-item:visible dark:text-gray-700 dark:hover:text-gray-50",
            )}
            onClick={handleTogglePin}
          >
            <Icon name={isPinned ? "PinFilled" : "Pin"} size={16} />
          </div>
        </div>
      </Tooltip>
    </TooltipProvider>
  );
};

export interface SidebarItemProps {
  id: string;
  title: string;
  children?: SidebarNode[];
  allowPinning?: boolean;
  icon?: IconName;
  expandedIcon?: IconName;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  id,
  title,
  children,
  allowPinning,
  icon,
  expandedIcon,
}) => {
  const open = useSidebarNodeState(id);
  const { toggleItem } = useSidebar();
  const toggleOpen = useCallback(() => toggleItem(id), [toggleItem, id]);

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (e.key === "Enter" || e.key === " ") {
        toggleOpen();
      }
    },
    [toggleOpen],
  );

  if (!children || (Array.isArray(children) && children.length === 0)) {
    return (
      <Item
        id={id}
        title={title}
        allowPinning={allowPinning}
        icon={icon}
        expandedIcon={expandedIcon}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        role="button"
        aria-expanded={open}
        onClick={toggleOpen}
        className="w-full"
        data-open={open}
        onKeyDown={handleKeyDown}
      >
        <Item
          id={id}
          title={title}
          open={open}
          allowPinning={allowPinning}
          icon={icon}
          expandedIcon={expandedIcon}
        />
      </div>
      <div
        role="region"
        aria-hidden={!open}
        className={`grid overflow-hidden text-sm text-slate-600 transition-all duration-200 ease-in-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        {open && (
          <div className="flex flex-col gap-1 overflow-hidden pl-6">
            {children.map((child) => (
              <SidebarItem
                key={child.id}
                id={child.id}
                title={child.title}
                children={child.children}
                allowPinning={allowPinning}
                icon={child.icon}
                expandedIcon={child.expandedIcon}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
