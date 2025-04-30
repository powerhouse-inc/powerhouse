import { cn } from "@powerhousedao/design-system/scalars";
import { diffSentences, diffWords } from "diff";
import { useMemo } from "react";
import type { WithDifference } from "../../../../../scalars/components/types.js";

interface TextDiffProps extends WithDifference<string> {
  value: string;
  className?: string;
}

export const TextDiff = ({
  baseValue,
  value,
  viewMode,
  diffMode = "words",
  className,
}: TextDiffProps) => {
  const wordsDiff = useMemo(() => {
    return diffMode === "words"
      ? diffWords(baseValue ?? "", value)
      : diffSentences(baseValue ?? "", value);
  }, [baseValue, value, diffMode]);

  return (
    <span className={cn("leading-[18px]", className)}>
      {wordsDiff.map((word, index) => {
        return word.added ? (
          viewMode === "addition" || viewMode === "mixed" ? (
            <span
              className="mr-1 bg-green-600/30 text-gray-700"
              key={`${word.value}-${index}`}
            >
              {word.value}
            </span>
          ) : null
        ) : word.removed ? (
          viewMode === "removal" || viewMode === "mixed" ? (
            <span
              className="mr-1 bg-red-600/30 text-gray-700"
              key={`${word.value}-${index}`}
            >
              {word.value}
            </span>
          ) : null
        ) : (
          <span className="mr-1" key={`${word.value}-${index}`}>
            {word.value}
          </span>
        );
      })}
    </span>
  );
};
