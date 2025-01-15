import React from "react";
import { Icon } from "@/powerhouse/components/icon";
import { cn } from "@/scalars/lib/utils";

interface ListItemProps {
  className?: string;
}

export const ListItem: React.FC<ListItemProps> = ({ className }) => {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1 rounded-md bg-transparent px-3 pb-2 pt-3",
        "hover:bg-gray-100 focus:bg-gray-200 dark:hover:bg-gray-900 dark:focus:bg-gray-800",
        className,
      )}
    >
      <div className={cn("")}>
        <Icon
          name="PowerhouseLogoSmall"
          size={24}
          className={cn(
            "text-gray-900 hover:text-gray-900 dark:text-gray-50 dark:hover:text-gray-50",
          )}
        />
        <span className={cn("")}>Blocktower Andromeda</span>
        <Icon
          name="CircleInfo"
          size={16}
          className={cn(
            "ml-auto cursor-pointer text-gray-600 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-500",
          )}
        />
      </div>
      <div className={cn("")}>
        <span className={cn("")}>phd:baefc2a4-f9a0-405-9896-w48</span>
        <Icon
          name="Copy"
          size={16}
          className={cn(
            "cursor-pointer text-gray-500 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-600",
          )}
        />
      </div>
      <div className={cn("")}>
        <p className={cn("")}>
          Lorem ipsum dolor sit amet consectetur.
          <br />
          Sed elementum tempor.
        </p>
        <span className={cn("")}>sku/rwa-portfolio</span>
      </div>
    </div>
  );
};
