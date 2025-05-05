import { cn } from "@powerhousedao/design-system/scalars";
import type { WithDifference } from "../../../../scalars/components/types.js";
import { InputDiff } from "./subcomponent/input-diff.js";
import { TextDiff } from "./subcomponent/text-diff.js";

interface SplittedInputDiffProps extends WithDifference<string> {
  value: string;
}

const SplittedInputDiff = ({
  baseValue,
  value,
  viewMode,
  diffMode,
}: SplittedInputDiffProps) => {
  return (
    <InputDiff>
      {viewMode === "mixed" ? (
        <>
          <TextDiff
            baseValue={baseValue}
            value={value}
            viewMode="removal"
            diffMode={diffMode}
            className={cn("flex-1")}
          />
          <div className={cn("ml-3 mr-3 h-[34px] w-px bg-gray-300")} />
          <TextDiff
            baseValue={baseValue}
            value={value}
            viewMode="addition"
            diffMode={diffMode}
            className={cn("flex-1")}
          />
        </>
      ) : (
        <TextDiff
          baseValue={baseValue}
          value={value}
          viewMode={viewMode}
          diffMode={diffMode}
          className={cn("flex-1")}
        />
      )}
    </InputDiff>
  );
};

export { SplittedInputDiff };
