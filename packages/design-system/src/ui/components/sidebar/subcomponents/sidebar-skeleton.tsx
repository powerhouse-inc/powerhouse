import { SidebarSkeletonItem } from "./sidebar-skeleton-item.js";

const skeletonItems = [
  { depth: 0, textWidth: "w-32" },
  { depth: 1, textWidth: "w-28" },
  { depth: 1, textWidth: "w-36" },
  { depth: 2, textWidth: "w-24" },
  { depth: 2, textWidth: "w-30" },
  { depth: 0, textWidth: "w-40" },
  { depth: 1, textWidth: "w-26" },
  { depth: 1, textWidth: "w-34" },
  { depth: 2, textWidth: "w-22" },
  { depth: 0, textWidth: "w-38" },
];

export const SidebarSkeleton = () => {
  return (
    <div
      className="flex-1 overflow-hidden p-2"
      role="status"
      aria-label="Loading sidebar content"
    >
      <div className="flex flex-col gap-2">
        {skeletonItems.map((item, index) => (
          <SidebarSkeletonItem
            key={index}
            depth={item.depth}
            textWidth={item.textWidth}
          />
        ))}
      </div>
    </div>
  );
};
