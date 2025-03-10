import { Icon } from "@/powerhouse";
import { type ReactNode } from "react";
import { twJoin, twMerge } from "tailwind-merge";

type DisclosureProps = {
  title: ReactNode;
  isOpen: boolean;
  onOpenChange: () => void;
  children: ReactNode;
  containerClassName?: string;
  toggleClassName?: string;
  contentClassName?: string;
};
export function Disclosure(props: DisclosureProps) {
  const {
    title,
    isOpen,
    onOpenChange,
    children,
    containerClassName,
    toggleClassName,
    contentClassName,
  } = props;
  return (
    <div className={twMerge(containerClassName)}>
      <div
        className={twMerge(
          "flex cursor-pointer justify-between text-gray-500",
          toggleClassName,
        )}
        onClick={onOpenChange}
      >
        <h2 className="font-semibold text-inherit">{title}</h2>
        <Icon
          className={twJoin("transition", isOpen ? "" : "-rotate-90")}
          size={16}
          name="ChevronDown"
        />
      </div>
      <div
        className={twMerge(
          "max-h-0 overflow-hidden transition-[max-height] duration-300 ease-in-out",
          isOpen && "max-h-screen",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
