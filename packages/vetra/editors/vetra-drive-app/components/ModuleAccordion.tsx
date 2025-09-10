import type React from "react";
import { useState } from "react";
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
      className={`flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-gray-50 ${headerClassName}`}
    >
      <div className="flex items-center gap-2">
        <ChevronIcon
          width={12}
          height={12}
          className={`text-gray-600 transition-transform duration-300 ${
            isOpen ? "rotate-90" : ""
          }`}
        />
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {count}
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAdd?.();
        }}
        className="rounded p-1 transition-colors hover:bg-gray-200"
      >
        <PlusIcon width={16} height={16} className="text-gray-600" />
      </button>
    </div>
  );

  return (
    <div className={`mb-2 ${className}`}>
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
