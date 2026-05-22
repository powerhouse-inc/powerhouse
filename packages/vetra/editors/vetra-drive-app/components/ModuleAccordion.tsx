import React, { useState } from "react";
import { twMerge } from "tailwind-merge";
import { ChevronIcon } from "../icons/ChevronIcon.js";
import { PlusIcon } from "../icons/PlusIcon.js";
import { Accordion } from "./Accordion.js";

interface ModuleAccordionProps {
  title: string;
  count: number;
  onAdd?: () => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
}

export const ModuleAccordion: React.FC<ModuleAccordionProps> = ({
  title,
  count,
  onAdd,
  children,
  defaultOpen = false,
  className = "",
  headerClassName = "",
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const header = (
    <div
      className={twMerge(
        "flex items-center justify-between rounded-md bg-white px-3 py-2 text-gray-900 transition-colors hover:bg-gray-50 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900",
        headerClassName,
      )}
    >
      <div className="flex items-center gap-2">
        <ChevronIcon
          width={12}
          height={12}
          className={twMerge(
            "text-gray-600 transition-transform duration-300 dark:text-slate-300",
            isOpen ? "rotate-90" : "",
          )}
        />
        <span className="text-sm font-medium text-gray-700 dark:text-slate-200">
          {title}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-slate-800 dark:text-slate-300">
          {count}
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAdd?.();
        }}
        className="rounded-sm p-1 transition-colors hover:bg-gray-200 dark:hover:bg-slate-700"
      >
        <PlusIcon
          width={16}
          height={16}
          className="text-gray-600 dark:text-slate-300"
        />
      </button>
    </div>
  );

  return (
    <div className={twMerge("mb-2", className)}>
      <Accordion
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        header={header}
      >
        <div className="px-3 pb-2">{children}</div>
      </Accordion>
    </div>
  );
};
