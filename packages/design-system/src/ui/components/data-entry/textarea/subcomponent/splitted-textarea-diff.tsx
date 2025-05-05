import { cn, FormGroup, FormLabel, type WithDifference } from "#scalars";
import { InputDiff } from "../../input/subcomponent/input-diff.js";
import { TextDiff } from "../../input/subcomponent/text-diff.js";
// import type { WithDifference } from "../../../../scalars/components/types.js";
// import { SplittedInputDiff } from "../input/splitted-input-diff.js";
interface TextInputDiffProps extends WithDifference<string> {
  value: string;
  label?: React.ReactNode;
  required?: boolean;
  ellipsis?: boolean;
  multiline?: boolean;
  rows?: number;
  hasPadding?: boolean;
}
const SplittedTextareaDiff = ({
  value,
  label,
  required,
  baseValue = "",
  viewMode = "edition",
  diffMode,
  ellipsis = true,
  multiline = false,
  rows = 3,
  hasPadding = false,
}: TextInputDiffProps) => {
  return (
    <FormGroup>
      {label && (
        <FormLabel disabled={true} required={required}>
          {label}
        </FormLabel>
      )}

      <InputDiff
        ellipsis={ellipsis}
        multiline={multiline}
        rows={rows}
        hasPadding={true}
      >
        <TextDiff
          baseValue={baseValue}
          value={value}
          viewMode={viewMode}
          diffMode={diffMode}
          className={cn("flex-1")}
        />
      </InputDiff>
    </FormGroup>
  );
};

export default SplittedTextareaDiff;
