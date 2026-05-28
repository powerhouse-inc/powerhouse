import { twMerge } from "tailwind-merge";

interface SidebarSkeletonItemProps {
  depth: number;
  textWidth: string;
  style?: React.CSSProperties;
}

export const SidebarSkeletonItem = ({
  depth,
  textWidth,
  style,
}: SidebarSkeletonItemProps) => {
  const paddingLeft = depth * 24;

  return (
    <div style={style} className="flex items-center px-2">
      <div
        className="flex h-8 w-full items-center gap-2 px-2 py-1"
        style={{ paddingLeft: paddingLeft + 8 }}
      >
        {/* Chevron icon skeleton */}
        <div className="flex size-4 min-w-4 items-center justify-center">
          <div className="size-4 min-w-4 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-600" />
        </div>

        {/* Text content skeleton */}
        <div
          className={twMerge(
            "h-4 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-600",
            textWidth,
          )}
        />
      </div>
    </div>
  );
};
