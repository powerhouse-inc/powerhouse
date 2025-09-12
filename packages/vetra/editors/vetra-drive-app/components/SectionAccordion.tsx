import React from "react";
import { useState } from "react";
import { ChevronIcon } from "../icons/ChevronIcon.js";
import { Accordion } from "./Accordion.js";

interface SectionAccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export const SectionAccordion: React.FC<SectionAccordionProps> = ({
  title,
  children,
  defaultOpen = false,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const header = (
    <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 transition-colors hover:bg-zinc-100">
      <ChevronIcon
        width={16}
        height={16}
        className={`text-gray-600 transition-transform duration-300 ${
          isOpen ? "rotate-90" : ""
        }`}
      />
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
    </div>
  );

  return (
    <div className={className}>
      <Accordion
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        header={header}
      >
        <div className="px-4 pb-4">{children}</div>
      </Accordion>
    </div>
  );
};
