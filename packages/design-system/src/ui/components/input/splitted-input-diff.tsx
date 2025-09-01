import type { WithDifference } from "@powerhousedao/design-system";
import {
    cn,
    Icon,
    Tooltip,
    TooltipProvider,
} from "@powerhousedao/design-system";
import { useCallback, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
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
          className={cn(
            "focus-visible:outline-none [&_svg]:pointer-events-none",
            hasHover &&
              "opacity-0 transition-opacity duration-500 group-hover:opacity-100",
          )}
        >
          <Icon name="Copy" size={16} className={cn("text-gray-500")} />
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
    <InputDiff className={cn("group")}>
      {viewMode === "mixed" ? (
        <>
          <div
            className={cn(
              "flex flex-1 items-center gap-2 truncate [&>span]:truncate",
            )}
          >
            <TextDiff
              baseValue={baseValue}
              value={value}
              viewMode="removal"
              diffMode={diffMode}
              className={cn("flex-1")}
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
          <div className={cn("ml-3 mr-3 h-[34px] w-px bg-gray-300")} />
          <div
            className={cn(
              "flex flex-1 items-center gap-2 truncate [&>span]:truncate",
            )}
          >
            <TextDiff
              baseValue={baseValue}
              value={value}
              viewMode="addition"
              diffMode={diffMode}
              className={cn("flex-1")}
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
          className={cn(
            "flex flex-1 items-center gap-2 truncate [&>span]:truncate",
          )}
        >
          <TextDiff
            baseValue={baseValue}
            value={value}
            viewMode={viewMode}
            diffMode={diffMode}
            className={cn("flex-1")}
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
