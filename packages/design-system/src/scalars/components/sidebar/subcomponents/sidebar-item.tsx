/* eslint-disable react/jsx-max-depth */
import { Icon } from "@/index";
import React, { KeyboardEventHandler, useCallback, useState } from "react";
import { Node } from "../types";
import { cn } from "@/scalars/lib";
import { useSidebar, useSidebarNodeState } from "./sidebar-provider";

interface ItemProps {
  title: string;
  open?: boolean;
}

const Item: React.FC<ItemProps> = ({ title, open }) => {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-gray-700 hover:bg-gray-100">
      <Icon
        name="ChevronDown"
        size={16}
        className={cn(
          "transition-all duration-300 ease-in-out",
          open ? "" : "-rotate-90",
          open === undefined ? "text-gray-300" : "text-gray-700",
        )}
      />
      <Icon name="File" size={16} />
      <div className="text-sm leading-5">{title}</div>
    </div>
  );
};

export interface SidebarItemProps {
  id: string;
  title: string;
  childrens?: Node[];
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  id,
  title,
  childrens,
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
    return <Item title={title} />;
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
        <Item title={title} open={open} />
      </div>
      <div
        role="region"
        aria-hidden={!open}
        className={`grid overflow-hidden text-sm text-slate-600 transition-all duration-300 ease-in-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="flex flex-col gap-1 overflow-hidden pl-6">
          {childrens.map((child) => (
            <SidebarItem
              key={child.id}
              id={child.id}
              title={child.title}
              childrens={child.childrens}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
