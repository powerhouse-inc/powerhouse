import { twMerge } from "tailwind-merge";
import type { BaseProps } from "../utils/types.js";

export function DriveLayout({ children, className, ...props }: BaseProps) {
  return (
    <DriveLayout.Container className={className} {...props}>
      {children}
    </DriveLayout.Container>
  );
}

DriveLayout.Container = function DriveLayoutContainer({
  children,
  className,
  containerProps,
  ...props
}: BaseProps) {
  return (
    <div
      className={twMerge("flex grow flex-col overflow-auto", className)}
      {...containerProps}
      {...props}
    >
      {children}
    </div>
  );
};

DriveLayout.Header = function DriveLayoutHeader({
  children,
  className,
  containerProps,
  ...props
}: BaseProps) {
  return (
    <div
      className={twMerge("flex-0", className)}
      {...containerProps}
      {...props}
    >
      {children}
    </div>
  );
};

DriveLayout.Content = function DriveLayoutContent({
  children,
  className,
  containerProps,
  ...props
}: BaseProps) {
  return (
    <div
      className={twMerge("mb-5 flex-1 px-4", className)}
      {...containerProps}
      {...props}
    >
      {children}
    </div>
  );
};

DriveLayout.ContentSection = function DriveLayoutContentSection({
  title,
  children,
  className,
  containerProps,
  ...props
}: BaseProps & { title?: string }) {
  return (
    <div className={twMerge(className)} {...containerProps} {...props}>
      {title && (
        <div className="mb-4 text-base font-semibold text-foreground">
          {title}
        </div>
      )}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
};

DriveLayout.Footer = function DriveLayoutFooter({
  children,
  className,
  containerProps,
  ...props
}: BaseProps) {
  return (
    <div
      className={twMerge("flex-0", className)}
      {...containerProps}
      {...props}
    >
      {children}
    </div>
  );
};
