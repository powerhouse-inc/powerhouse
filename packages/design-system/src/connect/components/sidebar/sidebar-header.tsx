import { SidebarHeader } from "#design-system";
import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

export interface ConnectSidebarHeaderProps extends ComponentProps<
  typeof SidebarHeader
> {}

export const ConnectSidebarHeader: React.FC<ConnectSidebarHeaderProps> = ({
  className,
  children,
  ...props
}) => {
  if (!children) {
    return null;
  }

  return (
    <SidebarHeader
      {...props}
      className={twMerge(
        "flex justify-center gap-4 border-b border-gray-300 py-4 text-gray-500 dark:bg-slate-700 dark:text-slate-100",
        className,
      )}
    >
      {children}
    </SidebarHeader>
  );
};
