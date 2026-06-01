import { twMerge } from "tailwind-merge";

export const Footer: React.FC<React.HTMLAttributes<HTMLElement>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <footer
      className={twMerge(
        "flex items-center gap-x-6 text-xs font-medium text-gray-300 dark:text-slate-600",
        typeof className === "string" && className,
      )}
      {...props}
    >
      {children}
    </footer>
  );
};
