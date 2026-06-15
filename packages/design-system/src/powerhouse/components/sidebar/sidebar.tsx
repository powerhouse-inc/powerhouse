import { useRef, type HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function SidebarHeader({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <div className={twMerge("shrink-0", className)} {...props} />;
}

export function SidebarFooter({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <div className={twMerge("shrink-0", className)} {...props} />;
}

type SidebarProps = HTMLAttributes<HTMLElement> & {
  maxWidth: string;
  minWidth: string;
};
export function Sidebar({
  maxWidth: _maxWidth = "304px",
  minWidth = "80px",
  className,
  children,
  ...props
}: SidebarProps) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      {...props}
      className={twMerge(
        `group z-1 flex h-full flex-col bg-sidebar text-sidebar-foreground`,
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
}
