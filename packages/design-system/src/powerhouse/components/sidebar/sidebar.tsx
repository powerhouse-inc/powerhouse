import { useRef } from "react";
import { twMerge } from "tailwind-merge";

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  maxWidth: string;
  minWidth: string;
}

export type SidebarHeaderProps = React.HTMLAttributes<HTMLElement>;

export function SidebarHeader({ className, ...props }: SidebarHeaderProps) {
  return <div className={twMerge("shrink-0", className)} {...props} />;
}

export type SidebarFooterProps = React.HTMLAttributes<HTMLElement>;

export function SidebarFooter({ className, ...props }: SidebarFooterProps) {
  return <div className={twMerge("shrink-0", className)} {...props} />;
}

export const Sidebar: React.FC<SidebarProps> = ({
  maxWidth = "304px",
  minWidth = "80px",
  className,
  children,
  ...props
}) => {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      {...props}
      className={twMerge(
        ` collapsed group flex h-full flex-col bg-slate-50`,
        className,
      )}
      ref={ref}
      style={{
        width: minWidth,
      }}
    >
      {children}
    </div>
  );
};
