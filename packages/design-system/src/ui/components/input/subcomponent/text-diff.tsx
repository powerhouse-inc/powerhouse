import type { WithDifference } from "#design-system";
import { twMerge } from "tailwind-merge";
import { diffSentences, diffWords } from "diff";
import { useMemo } from "react";

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
        ? "bg-success/10"
        : viewMode === "removal"
          ? "bg-destructive/10"
          : undefined
      : undefined;

  return (
    <span
      className={twMerge("leading-[18px] text-foreground", bgColor, className)}
    >
      {wordsDiff.map((word, index) => {
        return word.added ? (
          viewMode === "addition" || viewMode === "mixed" ? (
            <span
              className={twMerge(
                (diffMode === "words" || viewMode === "mixed") &&
                  "bg-success/10",
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
              className={twMerge(
                (diffMode === "words" || viewMode === "mixed") &&
                  "bg-destructive/10",
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
            className={twMerge(childrenClassName)}
          >
            {word.value}
          </span>
        );
      })}
    </span>
  );
};
