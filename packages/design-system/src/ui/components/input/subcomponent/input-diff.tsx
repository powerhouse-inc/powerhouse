import { cn } from "@powerhousedao/design-system/ui";

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
        "flex w-full items-center rounded-md font-sans text-sm font-normal leading-5 text-gray-700",
        "cursor-not-allowed border border-gray-300 bg-transparent px-3",
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
