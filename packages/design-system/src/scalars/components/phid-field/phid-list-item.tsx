import React from "react";
import { Icon } from "@/powerhouse/components/icon";
import { cn } from "@/scalars/lib/utils";
import type { PHIDProps, PHIDListItemProps } from "./types";

export const PHIDListItem: React.FC<
  { variant?: PHIDProps["variant"]; className?: string } & PHIDListItemProps
> = ({
  variant = "withId",
  title = "Title",
  path = "path/to/document",
  phid,
  description = "Description",
  className,
}) => {
  const renderWithId = () => (
    <div className={cn("flex w-full items-center gap-2")}>
      <span className={cn("truncate text-sm text-gray-600")}>{phid}</span>
    </div>
  );

  const renderWithIdAndTitle = () => (
    <div className={cn("flex w-full flex-col gap-1")}>
      <div className={cn("flex items-center gap-2")}>
        <Icon
          name="PowerhouseLogoSmall"
          size={24}
          className={cn(
            "text-gray-900 hover:text-gray-900 dark:text-gray-50 dark:hover:text-gray-50",
          )}
        />
        <span className={cn("grow font-medium")}>{title}</span>
      </div>
      <div className={cn("ml-8 flex max-w-full items-center gap-2")}>
        <span className={cn("truncate text-sm text-gray-600")}>{phid}</span>
      </div>
    </div>
  );

  const renderWithIdTitleAndDescription = () => (
    <div className={cn("flex w-full flex-col gap-1")}>
      <div className={cn("flex gap-2")}>
        <Icon
          name="PowerhouseLogoSmall"
          size={24}
          className={cn(
            "text-gray-900 hover:text-gray-900 dark:text-gray-50 dark:hover:text-gray-50",
          )}
        />
        <div className={cn("flex grow flex-col")}>
          <span className={cn("font-medium")}>{title}</span>
          <span className={cn("text-sm text-gray-500")}>{path}</span>
        </div>
      </div>
      <div className={cn("flex max-w-full items-center gap-2")}>
        <span className={cn("truncate text-sm text-gray-600")}>{phid}</span>
      </div>
      <div className={cn("flex flex-col gap-1")}>
        <p className={cn("text-sm text-gray-700 dark:text-gray-300")}>
          {description}
        </p>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "max-w-full rounded-md bg-transparent px-3 pb-2 pt-3",
        "focus:bg-gray-200 dark:focus:bg-gray-800",
        className,
      )}
    >
      {variant === "withId" && renderWithId()}
      {variant === "withIdAndTitle" && renderWithIdAndTitle()}
      {variant === "withIdTitleAndDescription" &&
        renderWithIdTitleAndDescription()}
    </div>
  );
};
