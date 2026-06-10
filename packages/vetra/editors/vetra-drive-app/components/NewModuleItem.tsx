import React from "react";
import { twMerge } from "tailwind-merge";
import { AddNewIcon } from "../icons/AddNewIcon.js";

interface NewModuleItemProps {
  title: string;
  subtitle: string;
  onClick: () => void;
  className?: string;
}

export const NewModuleItem: React.FC<NewModuleItemProps> = ({
  title,
  subtitle,
  onClick,
  className = "",
}) => {
  return (
    <button
      onClick={onClick}
      className={twMerge(
        "flex w-full items-center gap-3 rounded-md bg-gray-100 p-1 text-left transition-colors hover-hover dark:bg-slate-700",
        className,
      )}
    >
      <div className="shrink-0">
        <AddNewIcon />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-gray-900 dark:text-slate-50">
          {title}
        </h3>
        <p className="truncate text-xs text-gray-500 dark:text-slate-400">
          {subtitle}
        </p>
      </div>
    </button>
  );
};
