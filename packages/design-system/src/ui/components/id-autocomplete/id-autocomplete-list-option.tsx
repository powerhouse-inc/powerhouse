import type { IconName } from "#design-system";
import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";
import React from "react";
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
        className={twMerge(
          "shrink-0",
          asPlaceholder ? "text-muted-foreground" : "text-foreground",
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
      className={twMerge(
        "mt-0.5 focus-visible:outline-none",
        "disabled:disabled-effect [&_svg]:pointer-events-none",
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
        className={twMerge(
          "text-muted-foreground",
          isLoadingSelectedOption && "animate-spin",
          isFetchSelectedOptionSync && "animate-fade-in duration-500",
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
    <div className={twMerge("flex w-full items-center")}>
      <span
        className={twMerge(
          "truncate text-xs/5",
          asPlaceholder ? "text-muted-foreground" : "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );

  const renderWithValueTitleAndDescription = (showDescription = true) => (
    <div className={twMerge("flex w-full flex-col gap-1")}>
      <div className={twMerge("flex gap-2")}>
        <IconRenderer
          customIcon={asPlaceholder ? placeholderIcon : icon}
          asPlaceholder={asPlaceholder}
        />
        <div className={twMerge("flex min-w-0 grow flex-col gap-[-2px]")}>
          <span
            className={twMerge(
              "truncate text-sm/5 font-bold",
              asPlaceholder ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {title}
          </span>
          {!showValue && typeof path === "object" ? (
            <a
              href={path.url}
              target="_blank"
              rel="noopener noreferrer"
              className={twMerge(
                "truncate text-xs/5 text-info hover:underline focus-visible:outline-none",
              )}
            >
              {path.text}
            </a>
          ) : (
            <span
              className={twMerge(
                "truncate text-xs/5",
                asPlaceholder
                  ? "text-muted-foreground"
                  : "text-muted-foreground",
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
        <div className={twMerge("flex max-w-full items-center")}>
          <span
            className={twMerge(
              "truncate text-xs/5",
              asPlaceholder ? "text-muted-foreground" : "text-muted-foreground",
            )}
          >
            {value}
          </span>
        </div>
      )}
      {showDescription && (
        <div className={twMerge("flex flex-col")}>
          <p
            className={twMerge(
              "line-clamp-2 text-xs/5",
              asPlaceholder ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {description}
          </p>
        </div>
      )}
      {showDescription &&
        "agentType" in extraProps &&
        typeof extraProps.agentType === "string" && (
          <div className={twMerge("flex max-w-full items-center justify-end")}>
            <span
              className={twMerge(
                "truncate text-xs/5",
                asPlaceholder
                  ? "text-muted-foreground"
                  : "text-muted-foreground",
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
      className={twMerge(
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
