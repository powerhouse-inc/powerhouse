import {
  cn,
  type DiffMode,
  type ViewMode,
} from "@powerhousedao/design-system/scalars";
import { diffSentences, diffWords, type Change } from "diff";
import { useMemo } from "react";
import SplitDiff from "./split-diff.js";

interface DiffTextProps {
  baseline: string;
  value: string;
  viewMode: ViewMode;
  diffMode: DiffMode;
  className?: string;
  isFullWidth?: boolean;
}

const StringDiff = ({
  baseline = "",
  value = "",
  viewMode,
  diffMode = "sentences",
  className,
  isFullWidth = false,
}: DiffTextProps) => {
  const wordsDiff = useMemo((): Change[] => {
    return diffMode === "words"
      ? diffWords(baseline, value)
      : diffSentences(baseline, value);
  }, [baseline, value, diffMode]);

  const { original, changes } = useMemo(() => {
    if (viewMode === "mixed") {
      const removedChanges = wordsDiff.filter((word) => word.removed);
      const addedChanges = wordsDiff.filter((word) => word.added);
      const unchangedChanges = wordsDiff.filter(
        (word) => !word.added && !word.removed,
      );

      // Keep the original order of the words
      const orderedChanges = wordsDiff
        .filter((word) => !word.removed)
        .map((word) => {
          if (word.added) {
            return (
              addedChanges.find((added) => added.value === word.value) || word
            );
          }
          return word;
        });

      return {
        original: [...removedChanges, ...unchangedChanges],
        changes: orderedChanges,
      };
    }

    return {
      original: wordsDiff.filter((word) => !word.added),
      changes: wordsDiff.filter((word) => !word.removed),
    };
  }, [wordsDiff, viewMode]);

  return (
    <span
      className={cn(
        "inline-flex items-center leading-[16px]",
        isFullWidth && "w-full",
        className,
      )}
    >
      <SplitDiff changes={changes} original={original} viewMode={viewMode} />
    </span>
  );
};

export default StringDiff;
