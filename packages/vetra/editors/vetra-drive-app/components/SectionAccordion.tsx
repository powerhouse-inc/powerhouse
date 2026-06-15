import React, { useState } from "react";
import { twMerge } from "tailwind-merge";
import { ChevronIcon } from "../icons/ChevronIcon.js";
import { Accordion } from "./Accordion.js";

interface SectionAccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  actionButton?: React.ReactNode;
}

export const SectionAccordion: React.FC<SectionAccordionProps> = ({
  title,
  children,
  defaultOpen = false,
  className = "",
  actionButton,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const header = (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 transition-colors hover:hover-effect">
      <ChevronIcon
        width={16}
        height={16}
        className={twMerge(
          "text-foreground transition-transform duration-300",
          isOpen ? "rotate-90" : "",
        )}
      />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {actionButton && <div className="ml-auto">{actionButton}</div>}
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
