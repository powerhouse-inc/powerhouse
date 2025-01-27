import React from "react";
import { Icon } from "@/powerhouse/components/icon";
import { Button } from "@/scalars/components/fragments/button";
import { cn } from "@/scalars/lib/utils";
import type { PHIDProps, PHIDListItemProps } from "./types";

export const PHIDListItem: React.FC<
  { variant?: PHIDProps["variant"]; className?: string } & PHIDListItemProps
> = ({
  variant = "withId",
  title = "Title Unavailable",
  path = "aha/hah-lorem",
  phid,
  description = "Lorem ipsum dolor sit amet consectetur. Sed elementum tempor.",
  asPlaceholder,
  className,
}) => {
  const renderWithId = () => (
    <div className={cn("flex w-full items-center")}>
      <span
        className={cn(
          "truncate text-xs leading-5 text-gray-500 dark:text-gray-600",
        )}
      >
        {phid}
      </span>
    </div>
  );

  const renderWithIdAndTitle = () => (
    <div className={cn("flex w-full flex-col gap-1")}>
      <div className={cn("flex items-center gap-2")}>
        <Icon
          name="PowerhouseLogoSmall"
          size={24}
          className={cn(
            asPlaceholder
              ? "text-gray-400 dark:text-gray-700"
              : "text-gray-900 dark:text-gray-300",
          )}
        />
        <span
          className={cn(
            "grow text-sm font-bold leading-5",
            asPlaceholder
              ? "text-gray-400 dark:text-gray-700"
              : "text-gray-900 dark:text-gray-300",
          )}
        >
          {title}
        </span>
        {asPlaceholder === false && (
          <Icon
            name="Reload"
            size={16}
            className={cn("text-gray-500 dark:text-gray-600")}
          />
        )}
      </div>
      {!!phid && (
        <div className={cn("flex max-w-full items-center")}>
          <span
            className={cn(
              "truncate text-xs leading-5 text-gray-500 dark:text-gray-600",
            )}
          >
            {phid}
          </span>
        </div>
      )}
    </div>
  );

  const renderWithIdTitleAndDescription = () => (
    <div className={cn("flex w-full flex-col gap-1")}>
      <div className={cn("flex gap-2")}>
        <Icon
          name="PowerhouseLogoSmall"
          size={24}
          className={cn(
            asPlaceholder
              ? "text-gray-400 dark:text-gray-700"
              : "text-gray-900 dark:text-gray-300",
          )}
        />
        <div className={cn("flex grow flex-col gap-[-2px]")}>
          <span
            className={cn(
              "text-sm font-bold leading-5",
              asPlaceholder
                ? "text-gray-400 dark:text-gray-700"
                : "text-gray-900 dark:text-gray-300",
            )}
          >
            {title}
          </span>
          <span
            className={cn(
              "text-xs leading-5",
              asPlaceholder
                ? "text-gray-400 dark:text-gray-700"
                : "text-gray-500 dark:text-gray-600",
            )}
          >
            {path}
          </span>
        </div>
        {asPlaceholder === false && (
          <Icon
            name="Reload"
            size={16}
            className={cn("mt-0.5 text-gray-500 dark:text-gray-600")}
          />
        )}
      </div>
      {!!phid && (
        <div className={cn("flex max-w-full items-center")}>
          <span
            className={cn(
              "truncate text-xs leading-5 text-gray-500 dark:text-gray-600",
            )}
          >
            {phid}
          </span>
        </div>
      )}
      <div className={cn("flex flex-col")}>
        <p
          className={cn(
            "text-xs leading-5",
            asPlaceholder
              ? "text-gray-400 dark:text-gray-700"
              : "text-gray-900 dark:text-gray-300",
          )}
        >
          {description}
        </p>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "max-w-full rounded-md bg-transparent px-3 pb-2 pt-3",
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
