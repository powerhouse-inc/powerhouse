import { cn } from "@powerhousedao/design-system/scalars";

interface InputDiffProps {
  children: React.ReactNode;
  className?: string;
  ellipsis?: boolean;
  multiline?: boolean;
  rows?: number;
}

export const InputDiff = ({
  children,
  className,
  ellipsis = true,
  multiline = false,
  rows = 3,
}: InputDiffProps) => {
  return (
    <div
      className={cn(
        "flex w-full items-center rounded-md font-sans text-sm font-normal leading-5 text-gray-700",
        "cursor-not-allowed border border-gray-300 bg-transparent px-3",
        !multiline && ellipsis && "truncate [&>span]:truncate",
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
