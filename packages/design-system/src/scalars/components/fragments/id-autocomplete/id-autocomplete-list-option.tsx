import { Icon, type IconName } from "#powerhouse";
import React from "react";
import { cn } from "../../../lib/utils.js";
import type { IdAutocompleteOption, IdAutocompleteProps } from "./types.js";

const IconRenderer: React.FC<{
  customIcon?: IconName | React.ReactElement;
  asPlaceholder?: boolean;
}> = ({ customIcon, asPlaceholder }) => {
  if (typeof customIcon === "string") {
    return (
      <Icon
        name={customIcon}
        size={24}
        className={cn(
          "shrink-0",
          asPlaceholder
            ? "text-gray-400 dark:text-gray-700"
            : "text-gray-900 dark:text-gray-300",
        )}
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
  handleFetchSelectedOption: (value: string) => void;
  isFetchSelectedOptionSync?: boolean;
  value: string;
}> = ({
  isLoadingSelectedOption,
  handleFetchSelectedOption,
  isFetchSelectedOptionSync,
  value,
}) => (
  <div>
    <button
      type="button"
      disabled={isLoadingSelectedOption || isFetchSelectedOptionSync}
      onClick={() => {
        if (!isLoadingSelectedOption && !isFetchSelectedOptionSync) {
          handleFetchSelectedOption(value);
        }
      }}
      className={cn(
        "mt-0.5 focus-visible:outline-none",
        "disabled:pointer-events-none [&_svg]:pointer-events-none",
      )}
      aria-label={
        isLoadingSelectedOption
          ? "Loading"
          : isFetchSelectedOptionSync
            ? "Success"
            : "Reload"
      }
    >
      <Icon
        name={isFetchSelectedOptionSync ? "Checkmark" : "Reload"}
        size={16}
        className={cn(
          "text-gray-500 dark:text-gray-600",
          isLoadingSelectedOption && "animate-spin",
          isFetchSelectedOptionSync && "animate-in fade-in duration-500",
        )}
      />
    </button>
  </div>
);

type IdAutocompleteListOptionProps = {
  variant: IdAutocompleteProps["variant"];
  asPlaceholder?: boolean;
  showValue?: boolean;
  isLoadingSelectedOption?: boolean;
  handleFetchSelectedOption?: (value: string) => void;
  isFetchSelectedOptionSync?: boolean;
  className?: string;
  placeholderIcon?: IconName | React.ReactElement;
} & IdAutocompleteOption<Record<string, unknown>>;

const IdAutocompleteListOption: React.FC<IdAutocompleteListOptionProps> = ({
  variant = "withValue",
  icon,
  title = "Title not available",
  path = "Path not available",
  value,
  description = "Description not available",
  asPlaceholder,
  showValue = true,
  isLoadingSelectedOption,
  handleFetchSelectedOption,
  isFetchSelectedOptionSync,
  className,
  placeholderIcon = "PowerhouseLogoSmall",
  ...extraProps
}) => {
  const renderWithValue = () => (
    <div className={cn("flex w-full items-center")}>
      <span
        className={cn(
          "truncate text-xs leading-5",
          asPlaceholder
            ? "text-gray-400 dark:text-gray-700"
            : "text-gray-500 dark:text-gray-600",
        )}
      >
        {value}
      </span>
    </div>
  );

  const renderWithValueTitleAndDescription = (showDescription = true) => (
    <div className={cn("flex w-full flex-col gap-1")}>
      <div className={cn("flex gap-2")}>
        <IconRenderer
          customIcon={asPlaceholder ? placeholderIcon : icon}
          asPlaceholder={asPlaceholder}
        />
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
          {!showValue && typeof path === "object" ? (
            <a
              href={path.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "truncate text-xs leading-5 text-blue-900 hover:underline focus-visible:outline-none",
              )}
            >
              {path.text}
            </a>
          ) : (
            <span
              className={cn(
                "truncate text-xs leading-5",
                asPlaceholder
                  ? "text-gray-400 dark:text-gray-700"
                  : "text-gray-500 dark:text-gray-600",
              )}
            >
              {typeof path === "object" ? path.text : path}
            </span>
          )}
        </div>
        {asPlaceholder === false && handleFetchSelectedOption && (
          <ReloadButton
            isLoadingSelectedOption={isLoadingSelectedOption}
            handleFetchSelectedOption={handleFetchSelectedOption}
            isFetchSelectedOptionSync={isFetchSelectedOptionSync}
            value={value}
          />
        )}
      </div>
      {showValue && (
        <div className={cn("flex max-w-full items-center")}>
          <span
            className={cn(
              "truncate text-xs leading-5",
              asPlaceholder
                ? "text-gray-400 dark:text-gray-700"
                : "text-gray-500 dark:text-gray-600",
            )}
          >
            {value}
          </span>
        </div>
      )}
      {showDescription && (
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
      )}
      {showDescription &&
        "agentType" in extraProps &&
        typeof extraProps.agentType === "string" && (
          <div className={cn("flex max-w-full items-center justify-end")}>
            <span
              className={cn(
                "truncate text-xs leading-5",
                asPlaceholder
                  ? "text-gray-400 dark:text-gray-700"
                  : "text-gray-500 dark:text-gray-600",
              )}
            >
              {extraProps.agentType}
            </span>
          </div>
        )}
    </div>
  );

  return (
    <div
      className={cn(
        "w-full max-w-full rounded-md bg-transparent px-3 pb-2",
        variant === "withValue" ? "pt-2" : "pt-3",
        className,
      )}
    >
      {variant === "withValue" && renderWithValue()}
      {variant === "withValueAndTitle" &&
        renderWithValueTitleAndDescription(false)}
      {variant === "withValueTitleAndDescription" &&
        renderWithValueTitleAndDescription()}
    </div>
  );
};

export { IdAutocompleteListOption, type IdAutocompleteListOptionProps };
