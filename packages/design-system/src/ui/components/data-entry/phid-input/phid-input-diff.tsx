import { Icon, type IconName } from "#powerhouse";
import { cn, FormLabel } from "@powerhousedao/design-system/scalars";
import React from "react";
import { SplittedInputDiff } from "../input/splitted-input-diff.js";
import { TextDiff } from "../input/subcomponent/text-diff.js";
import type { PHIDInputProps, PHIDInputWithDifference } from "./types.js";

interface IconRendererProps {
  customIcon?: IconName | React.ReactElement;
  asPlaceholder?: boolean;
}

const IconRenderer = ({ customIcon, asPlaceholder }: IconRendererProps) => {
  if (typeof customIcon === "string") {
    return (
      <Icon
        name={customIcon}
        size={24}
        className={cn(
          "shrink-0",
          asPlaceholder ? "text-gray-400" : "text-gray-700",
        )}
      />
    );
  }
  if (React.isValidElement(customIcon)) {
    return <div className="size-6 shrink-0 overflow-hidden">{customIcon}</div>;
  }
  return null;
};

interface PHIDInputDiffProps extends PHIDInputWithDifference {
  value: PHIDInputProps["value"];
  label: PHIDInputProps["label"];
  required: PHIDInputProps["required"];
  autoComplete: PHIDInputProps["autoComplete"];
  initialOptions: PHIDInputProps["initialOptions"];
  previewPlaceholder: PHIDInputProps["previewPlaceholder"];
  variant: PHIDInputProps["variant"];
}

const PHIDInputDiff = ({
  value = "",
  label,
  required,
  autoComplete,
  initialOptions,
  previewPlaceholder,
  variant,
  viewMode,
  diffMode,
  baseValue = "",
  basePreviewTitle = "",
  basePreviewPath = "",
  basePreviewDescription = "",
}: PHIDInputDiffProps) => {
  const matchingOption = Array.isArray(initialOptions)
    ? initialOptions.find((option) => option.value === value)
    : undefined;
  const previewPlaceholderPath =
    (typeof previewPlaceholder?.path === "object"
      ? previewPlaceholder.path.text
      : previewPlaceholder?.path) ?? "";

  const previewTitle = matchingOption?.title ?? "";
  const previewPath =
    (typeof matchingOption?.path === "object"
      ? matchingOption.path.text
      : matchingOption?.path) ?? "";
  const previewDescription = matchingOption?.description ?? "";

  // TODO: implement icon differences
  // temporary logic to handle icon rendering
  const asPlaceholder = matchingOption?.icon === undefined;
  const previewIcon = asPlaceholder
    ? (previewPlaceholder?.icon ?? "PowerhouseLogoSmall")
    : matchingOption.icon;

  return (
    <div className={cn("flex flex-col gap-2")}>
      {label && (
        <FormLabel disabled={true} required={required}>
          {label}
        </FormLabel>
      )}

      {/* container for the entire fake PHID component */}
      <div className={cn("relative w-full rounded-md bg-gray-100")}>
        {/* input absolutely positioned */}
        <div
          className={cn(
            "absolute left-0 right-0 top-0 z-10 w-full rounded-md bg-gray-50",
          )}
        >
          <SplittedInputDiff
            baseValue={baseValue}
            value={value}
            viewMode={viewMode}
            diffMode={diffMode}
          />
        </div>

        {/* container for the option preview */}
        {autoComplete &&
          (variant === "withValueAndTitle" ||
            variant === "withValueTitleAndDescription") && (
            <div className={cn("w-full max-w-full rounded-md px-3 pb-2 pt-3")}>
              <div className={cn("mt-8 flex w-full flex-col gap-1")}>
                <div
                  className={cn(
                    "grid w-full",
                    viewMode === "mixed" && "grid-cols-2 gap-4",
                  )}
                >
                  <div
                    className={cn(
                      "flex gap-2 overflow-hidden",
                      viewMode === "mixed" && "pr-1",
                    )}
                  >
                    {/* left preview icon */}
                    <IconRenderer
                      customIcon={previewIcon}
                      asPlaceholder={asPlaceholder}
                    />

                    <div
                      className={cn(
                        "flex min-w-0 grow flex-col gap-1 overflow-hidden",
                      )}
                    >
                      {/* left preview title */}
                      {((viewMode === "removal" || viewMode === "mixed") &&
                        basePreviewTitle === "") ||
                      (viewMode === "addition" && previewTitle === "") ? (
                        <span
                          className={cn(
                            "w-full truncate text-sm font-bold leading-[18px] text-gray-400",
                          )}
                        >
                          {previewPlaceholder?.title ?? "Title not available"}
                        </span>
                      ) : (
                        <TextDiff
                          baseValue={basePreviewTitle}
                          value={previewTitle}
                          viewMode={viewMode === "mixed" ? "removal" : viewMode}
                          diffMode={diffMode}
                          className={cn(
                            "w-full truncate text-sm font-bold leading-[18px]",
                          )}
                        />
                      )}

                      {/* left preview path */}
                      {((viewMode === "removal" || viewMode === "mixed") &&
                        basePreviewPath === "") ||
                      (viewMode === "addition" && previewPath === "") ? (
                        <span
                          className={cn(
                            "w-full truncate text-xs leading-[18px] text-gray-400",
                          )}
                        >
                          {previewPlaceholderPath === ""
                            ? "Type not available"
                            : previewPlaceholderPath}
                        </span>
                      ) : (
                        <TextDiff
                          baseValue={basePreviewPath}
                          value={previewPath}
                          viewMode={viewMode === "mixed" ? "removal" : viewMode}
                          diffMode={diffMode}
                          className={cn(
                            "w-full truncate text-xs leading-[18px] text-gray-500",
                          )}
                        />
                      )}
                    </div>
                  </div>

                  {viewMode === "mixed" && (
                    <div className={cn("flex gap-2 overflow-hidden pl-1")}>
                      {/* right preview icon */}
                      <IconRenderer
                        customIcon={previewIcon}
                        asPlaceholder={asPlaceholder}
                      />

                      <div
                        className={cn(
                          "flex min-w-0 grow flex-col gap-1 overflow-hidden",
                        )}
                      >
                        {/* right preview title */}
                        {previewTitle === "" ? (
                          <span
                            className={cn(
                              "w-full truncate text-sm font-bold leading-[18px] text-gray-400",
                            )}
                          >
                            {previewPlaceholder?.title ?? "Title not available"}
                          </span>
                        ) : (
                          <TextDiff
                            baseValue={basePreviewTitle}
                            value={previewTitle}
                            viewMode="addition"
                            diffMode={diffMode}
                            className={cn(
                              "w-full truncate text-sm font-bold leading-[18px]",
                            )}
                          />
                        )}

                        {/* right preview path */}
                        {previewPath === "" ? (
                          <span
                            className={cn(
                              "w-full truncate text-xs leading-[18px] text-gray-400",
                            )}
                          >
                            {previewPlaceholderPath === ""
                              ? "Type not available"
                              : previewPlaceholderPath}
                          </span>
                        ) : (
                          <TextDiff
                            baseValue={basePreviewPath}
                            value={previewPath}
                            viewMode="addition"
                            diffMode={diffMode}
                            className={cn(
                              "w-full truncate text-xs leading-[18px] text-gray-500",
                            )}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {variant === "withValueTitleAndDescription" && (
                  <div
                    className={cn(
                      "grid w-full",
                      viewMode === "mixed" && "grid-cols-2 gap-4",
                    )}
                  >
                    <div
                      className={cn(
                        "flex w-full flex-col",
                        viewMode === "mixed" && "pr-1",
                      )}
                    >
                      {/* left preview description */}
                      {((viewMode === "removal" || viewMode === "mixed") &&
                        basePreviewDescription === "") ||
                      (viewMode === "addition" && previewDescription === "") ? (
                        <span
                          className={cn(
                            "line-clamp-2 w-full text-xs leading-5 text-gray-400",
                          )}
                        >
                          {previewPlaceholder?.description ??
                            "Description not available"}
                        </span>
                      ) : (
                        <TextDiff
                          baseValue={basePreviewDescription}
                          value={previewDescription}
                          viewMode={viewMode === "mixed" ? "removal" : viewMode}
                          diffMode={diffMode}
                          className={cn("w-full text-xs leading-5")}
                          childrenClassName={cn("line-clamp-2")}
                        />
                      )}
                    </div>

                    {viewMode === "mixed" && (
                      <div className={cn("flex w-full flex-col pl-1")}>
                        {/* right preview description */}
                        {previewDescription === "" ? (
                          <span
                            className={cn(
                              "line-clamp-2 w-full text-xs leading-5 text-gray-400",
                            )}
                          >
                            {previewPlaceholder?.description ??
                              "Description not available"}
                          </span>
                        ) : (
                          <TextDiff
                            baseValue={basePreviewDescription}
                            value={previewDescription}
                            viewMode="addition"
                            diffMode={diffMode}
                            className={cn("w-full text-xs leading-5")}
                            childrenClassName={cn("line-clamp-2")}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export { PHIDInputDiff };
