/* eslint-disable react/jsx-max-depth */
"use client";

import { Icon } from "@/index";
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
}

export const Item: React.FC<ItemProps> = ({
  id,
  title,
  open,
  pinnedMode,
  allowPinning,
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

  return (
    <TooltipProvider>
      <Tooltip content={title} triggerAsChild side="bottom" delayDuration={700}>
        <div
          id={`sidebar-item-${id}`}
          className={cn(
            "group/sidebar-item dark:hover:bg-charcoal-900 relative flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-2 py-1.5 text-gray-700 hover:bg-gray-100 dark:text-gray-400",
            allowPinning && "hover:pr-6",
            isPinned && "pr-6",
            // line between pinned items
            pinnedMode &&
              "after:absolute after:-top-2.5 after:left-3.5 after:h-4 after:w-px after:bg-gray-300 first:after:hidden",
            isActive && "font-medium text-gray-900 dark:text-gray-50",
          )}
          onClick={handleClick}
        >
          <div className="flex max-w-full items-center gap-2">
            {!pinnedMode && (
              <Icon
                name="ChevronDown"
                size={16}
                className={cn(
                  "min-w-4 transition-all duration-300 ease-in-out",
                  open ? "" : "-rotate-90",
                  open === undefined
                    ? "text-gray-300 dark:text-gray-700"
                    : "text-gray-700 dark:text-gray-400",
                )}
              />
            )}
            <Icon name="File" size={16} className="min-w-4" />
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
                ? "text-gray-700 dark:text-gray-50"
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
  childrens?: SidebarNode[];
  allowPinning?: boolean;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  id,
  title,
  childrens,
  allowPinning,
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

  if (!childrens || (Array.isArray(childrens) && childrens.length === 0)) {
    return <Item id={id} title={title} allowPinning={allowPinning} />;
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
        <Item id={id} title={title} open={open} allowPinning={allowPinning} />
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
            {childrens.map((child) => (
              <SidebarItem
                key={child.id}
                id={child.id}
                title={child.title}
                childrens={child.childrens}
                allowPinning={allowPinning}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
