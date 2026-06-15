import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";
import { useCallback, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import type { WithDifference } from "../../types.js";
import { Tooltip, TooltipProvider } from "../tooltip/tooltip.js";
import { InputDiff } from "./subcomponent/input-diff.js";
import { TextDiff } from "./subcomponent/text-diff.js";
interface CopyIconProps {
  value: string;
  hasCopied: boolean;
  setHasCopied: (hasCopied: boolean) => void;
  hasHover: boolean;
}

const CopyIcon = ({
  value,
  hasCopied,
  setHasCopied,
  hasHover,
}: CopyIconProps) => {
  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
      })
      .catch((error: unknown) => {
        console.error("Failed to copy value: ", error);
      });
  }, [value, setHasCopied]);

  return (
    <TooltipProvider>
      <Tooltip content="Copied!" open={hasCopied} triggerAsChild>
        <button
          type="button"
          onClick={copy}
          className={twMerge(
            "focus-visible:outline-none [&_svg]:pointer-events-none",
            hasHover &&
              "opacity-0 transition-opacity duration-500 group-hover:opacity-100",
          )}
        >
          <Icon
            name="Copy"
            size={16}
            className={twMerge("text-muted-foreground")}
          />
        </button>
      </Tooltip>
    </TooltipProvider>
  );
};

interface SplittedInputDiffProps extends WithDifference<string> {
  value: string;
  showCopyIcon?: boolean;
}

export const SplittedInputDiff = ({
  baseValue,
  value,
  viewMode,
  diffMode,
  showCopyIcon = false,
}: SplittedInputDiffProps) => {
  const [hasCopiedLeft, setHasCopiedLeft] = useState(false);
  const [hasCopiedRight, setHasCopiedRight] = useState(false);
  const hasHover = useMediaQuery("(hover: hover) and (pointer: fine)");

  return (
    <InputDiff className={twMerge("group")}>
      {viewMode === "mixed" ? (
        <>
          <div
            className={twMerge(
              "flex flex-1 items-center gap-2 truncate [&>span]:truncate",
            )}
          >
            <TextDiff
              baseValue={baseValue}
              value={value}
              viewMode="removal"
              diffMode={diffMode}
              className={twMerge("flex-1")}
            />
            {showCopyIcon && baseValue !== undefined && baseValue !== "" && (
              <CopyIcon
                value={baseValue}
                hasCopied={hasCopiedLeft}
                setHasCopied={setHasCopiedLeft}
                hasHover={hasHover}
              />
            )}
          </div>
          <div className={twMerge("mx-3 h-[34px] w-px bg-secondary")} />
          <div
            className={twMerge(
              "flex flex-1 items-center gap-2 truncate [&>span]:truncate",
            )}
          >
            <TextDiff
              baseValue={baseValue}
              value={value}
              viewMode="addition"
              diffMode={diffMode}
              className={twMerge("flex-1")}
            />
            {showCopyIcon && value !== "" && (
              <CopyIcon
                value={value}
                hasCopied={hasCopiedRight}
                setHasCopied={setHasCopiedRight}
                hasHover={hasHover}
              />
            )}
          </div>
        </>
      ) : (
        <div
          className={twMerge(
            "flex flex-1 items-center gap-2 truncate [&>span]:truncate",
          )}
        >
          <TextDiff
            baseValue={baseValue}
            value={value}
            viewMode={viewMode}
            diffMode={diffMode}
            className={twMerge("flex-1")}
          />
          {showCopyIcon &&
            ((viewMode === "removal" &&
              baseValue !== undefined &&
              baseValue !== "") ||
              (viewMode === "addition" && value !== "")) && (
              <CopyIcon
                value={viewMode === "removal" ? (baseValue ?? "") : value}
                hasCopied={hasCopiedLeft}
                setHasCopied={setHasCopiedLeft}
                hasHover={hasHover}
              />
            )}
        </div>
      )}
    </InputDiff>
  );
};
