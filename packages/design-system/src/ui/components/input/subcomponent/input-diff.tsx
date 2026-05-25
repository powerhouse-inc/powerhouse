import { cn } from "#design-system";

interface InputDiffProps {
  children: React.ReactNode;
  className?: string;
  ellipsis?: boolean;
  multiline?: boolean;
  rows?: number;
  hasPadding?: boolean;
}

export const InputDiff = ({
  children,
  className,
  ellipsis = true,
  multiline = false,
  rows = 3,
  hasPadding = false,
}: InputDiffProps) => {
  return (
    <div
      className={cn(
        "flex w-full items-center rounded-md font-sans text-sm/5 font-normal text-gray-700 dark:text-slate-200",
        "cursor-not-allowed border border-gray-300 bg-transparent px-3 dark:border-slate-500",
        !multiline && ellipsis && "truncate [&>span]:truncate",
        hasPadding && "items-start py-2",
        className,
      )}
      style={{
        minHeight: multiline ? `${rows * 1.5}rem` : "2.25rem",
      }}
    >
      {children}
    </div>
  );
};
