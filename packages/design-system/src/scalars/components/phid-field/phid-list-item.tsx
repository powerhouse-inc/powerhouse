import React from "react";
import { Icon, type IconName } from "@/powerhouse/components/icon";
import { cn } from "@/scalars/lib/utils";
import type { PHIDProps, PHIDItem } from "./types";

const IconRenderer: React.FC<{
  customIcon?: IconName | React.ReactElement;
}> = ({ customIcon }) => {
  if (typeof customIcon === "string") {
    return (
      <Icon
        name={customIcon}
        size={24}
        className={cn("shrink-0 text-gray-900 dark:text-gray-300")}
      />
    );
  }
  if (React.isValidElement(customIcon)) {
    return <div className="size-6 shrink-0 overflow-hidden">{customIcon}</div>;
  }
  return null;
};

const ReloadButton: React.FC<{
  isLoadingSelectedOption?: boolean;
  handleFetchSelectedOption: (phid: string) => void;
  phid: string;
}> = ({ isLoadingSelectedOption, handleFetchSelectedOption, phid }) => (
  <div>
    <button
      type="button"
      disabled={isLoadingSelectedOption}
      onClick={() => {
        if (!isLoadingSelectedOption) {
          handleFetchSelectedOption(phid);
        }
      }}
      className={cn(
        "mt-0.5 focus-visible:outline-none",
        "disabled:pointer-events-none [&_svg]:pointer-events-none",
      )}
      aria-label={isLoadingSelectedOption ? "Loading" : "Reload"}
    >
      <Icon
        name="Reload"
        size={16}
        className={cn(
          "text-gray-500 dark:text-gray-600",
          isLoadingSelectedOption && "animate-spin",
        )}
      />
    </button>
  </div>
);

export type PHIDListItemProps = {
  variant: PHIDProps["variant"];
  asPlaceholder?: boolean;
  showPHID?: boolean;
  isLoadingSelectedOption?: boolean;
  handleFetchSelectedOption?: (phid: string) => void;
  className?: string;
} & PHIDItem;

export const PHIDListItem: React.FC<PHIDListItemProps> = ({
  variant = "withId",
  icon,
  title = "Title not available",
  path = "Path not available",
  phid,
  description = "Description not available",
  asPlaceholder,
  showPHID = true,
  isLoadingSelectedOption,
  handleFetchSelectedOption,
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
        {asPlaceholder ? (
          <Icon
            name="PowerhouseLogoSmall"
            size={24}
            className={cn("shrink-0 text-gray-400 dark:text-gray-700")}
          />
        ) : (
          <IconRenderer customIcon={icon} />
        )}
        <span
          className={cn(
            "grow truncate text-sm font-bold leading-5",
            asPlaceholder
              ? "text-gray-400 dark:text-gray-700"
              : "text-gray-900 dark:text-gray-300",
          )}
        >
          {title}
        </span>
        {asPlaceholder === false && handleFetchSelectedOption && (
          <ReloadButton
            isLoadingSelectedOption={isLoadingSelectedOption}
            handleFetchSelectedOption={handleFetchSelectedOption}
            phid={phid}
          />
        )}
      </div>
      {showPHID && (
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
        {asPlaceholder ? (
          <Icon
            name="PowerhouseLogoSmall"
            size={24}
            className={cn("shrink-0 text-gray-400 dark:text-gray-700")}
          />
        ) : (
          <IconRenderer customIcon={icon} />
        )}
        <div className={cn("flex min-w-0 grow flex-col gap-[-2px]")}>
          <span
            className={cn(
              "truncate text-sm font-bold leading-5",
              asPlaceholder
                ? "text-gray-400 dark:text-gray-700"
                : "text-gray-900 dark:text-gray-300",
            )}
          >
            {title}
          </span>
          <span
            className={cn(
              "truncate text-xs leading-5",
              asPlaceholder
                ? "text-gray-400 dark:text-gray-700"
                : "text-gray-500 dark:text-gray-600",
            )}
          >
            {path}
          </span>
        </div>
        {asPlaceholder === false && handleFetchSelectedOption && (
          <ReloadButton
            isLoadingSelectedOption={isLoadingSelectedOption}
            handleFetchSelectedOption={handleFetchSelectedOption}
            phid={phid}
          />
        )}
      </div>
      {showPHID && (
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
            "line-clamp-2 text-xs leading-5",
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
        "max-w-full rounded-md bg-transparent px-3 pb-2",
        variant === "withId" ? "pt-2" : "pt-3",
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
