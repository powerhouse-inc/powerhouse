import type React from "react";
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
      className={`flex w-full items-center gap-3 rounded-md bg-zinc-100 p-1 text-left transition-colors hover:bg-zinc-200 ${className}`}
    >
      <div className="flex-shrink-0">
        <AddNewIcon />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-gray-900">{title}</h3>
        <p className="truncate text-xs text-gray-500">{subtitle}</p>
      </div>
    </button>
  );
};
