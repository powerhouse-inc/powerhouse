/* eslint-disable react/jsx-max-depth */
import { cn } from "@powerhousedao/design-system/scalars";
import type { WithDifference } from "../../../../scalars/components/types.js";
import { InputDiff } from "../input/input-diff.js";
import { TextDiff } from "../input/text-diff.js";

interface PHIDInputDiffProps extends WithDifference<string> {
  value: string;
  variant: "withValue" | "withValueAndTitle" | "withValueTitleAndDescription";
}

// WIP
const PHIDInputDiff = ({
  value,
  viewMode,
  diffMode,
  baseValue,
  variant,
}: PHIDInputDiffProps) => {
  return (
    <div className={cn("flex flex-col gap-2")}>
      {/*phidProps.label && (
        <FormLabel disabled={true} required={phidProps.required}>
          {phidProps.label}
        </FormLabel>
      )*/}

      {/* container for the entire fake PHID component */}
      <div className={cn("relative w-full rounded-md bg-gray-100")}>
        {/* input absolutely positioned */}
        <div
          className={cn(
            "absolute left-0 right-0 top-0 z-10 w-full rounded-md bg-gray-50",
          )}
        >
          <InputDiff>
            <TextDiff
              baseValue={baseValue?.replace(/phd:|phd:\/\//, "") ?? ""}
              value={value.replace(/phd:|phd:\/\//, "")}
              viewMode={viewMode}
              diffMode={diffMode}
            />
          </InputDiff>
        </div>

        {/* container for the option info */}
        <div className={cn("w-full max-w-full rounded-md px-3 pb-2 pt-3")}>
          <div className={cn("mt-8 flex w-full flex-col gap-1")}>
            {(variant === "withValueAndTitle" ||
              variant === "withValueTitleAndDescription") && (
              <div className={cn("flex w-full gap-2")}>
                {/* icon space */}
                <div className={cn("size-6 shrink-0")} />

                <div
                  className={cn(
                    "flex w-full min-w-0 max-w-full grow flex-col gap-[-2px] overflow-hidden",
                  )}
                >
                  {/* title */}
                  <TextDiff
                    baseValue={"Title not available"} // TODO: add correct value
                    value={"Title not available"} // TODO: add correct value
                    viewMode={viewMode}
                    diffMode={diffMode}
                    className={cn(
                      "w-full max-w-full truncate text-sm leading-5",
                    )}
                  />

                  {/* path */}
                  <TextDiff
                    baseValue={"Type not available"} // TODO: add correct value
                    value={"Type not available"} // TODO: add correct value
                    viewMode={viewMode}
                    diffMode={diffMode}
                    className={cn(
                      "w-full max-w-full truncate text-xs leading-5",
                    )}
                  />
                </div>
              </div>
            )}

            {/* description */}
            {variant === "withValueTitleAndDescription" && (
              <div className={cn("flex w-full flex-col")}>
                <TextDiff
                  baseValue={"Description not available"} // TODO: add correct value
                  value={"Description not available"} // TODO: add correct value
                  viewMode={viewMode}
                  diffMode={diffMode}
                  className={cn(
                    "line-clamp-2 w-full max-w-full text-xs leading-5",
                  )}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { PHIDInputDiff };
