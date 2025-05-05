import { cn } from "@powerhousedao/design-system/scalars";
import { diffSentences, diffWords } from "diff";
import { useMemo } from "react";
import type { WithDifference } from "../../../../scalars/components/types.js";

interface TextDiffProps extends WithDifference<string> {
  value: string;
  className?: string;
  childrenClassName?: string;
}

export const TextDiff = ({
  baseValue,
  value,
  viewMode,
  diffMode = "words",
  className,
  childrenClassName,
}: TextDiffProps) => {
  const wordsDiff = useMemo(() => {
    return diffMode === "words"
      ? diffWords(baseValue ?? "", value)
      : diffSentences(baseValue ?? "", value);
  }, [baseValue, value, diffMode]);

  const hasChanges = useMemo(() => {
    return wordsDiff.some((word) => word.added || word.removed);
  }, [wordsDiff]);

  const bgColor =
    diffMode === "sentences" && hasChanges
      ? viewMode === "addition"
        ? "bg-green-600/30"
        : viewMode === "removal"
          ? "bg-red-600/30"
          : undefined
      : undefined;

  return (
    <span className={cn("leading-[18px] text-gray-700", bgColor, className)}>
      {wordsDiff.map((word, index) => {
        return word.added ? (
          viewMode === "addition" || viewMode === "mixed" ? (
            <span
              className={cn(
                (diffMode === "words" || viewMode === "mixed") &&
                  "bg-green-600/30",
                childrenClassName,
              )}
              key={`${word.value}-${index}`}
            >
              {word.value}
            </span>
          ) : null
        ) : word.removed ? (
          viewMode === "removal" || viewMode === "mixed" ? (
            <span
              className={cn(
                (diffMode === "words" || viewMode === "mixed") &&
                  "bg-red-600/30",
                childrenClassName,
              )}
              key={`${word.value}-${index}`}
            >
              {word.value}
            </span>
          ) : null
        ) : (
          <span
            key={`${word.value}-${index}`}
            className={cn(childrenClassName)}
          >
            {word.value}
          </span>
        );
      })}
    </span>
  );
};
