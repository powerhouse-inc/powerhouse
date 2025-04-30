import { FormGroup, FormLabel } from "#scalars";
import type { WithDifference } from "../../../../scalars/components/types.js";
import { InputDiff } from "../input/subcomponent/input-diff.js";
import StringDiff from "../input/subcomponent/string-diff.js";
interface TextInputDiffProps extends WithDifference<string> {
  value: string;
  label?: React.ReactNode;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
}
const TextInputDiff = ({
  value,
  label,
  required,
  multiline,
  rows,
  baseValue = "",
  viewMode = "edition",
  diffMode = "words",
}: TextInputDiffProps) => {
  return (
    <FormGroup>
      {label && (
        <FormLabel disabled={true} required={required}>
          {label}
        </FormLabel>
      )}
      <InputDiff multiline={multiline || false} rows={rows || 3}>
        <StringDiff
          baseline={baseValue}
          value={value.toString()}
          viewMode={viewMode}
          diffMode={diffMode}
          className={multiline ? "leading-5" : undefined}
          isFullWidth={true}
        />
      </InputDiff>
    </FormGroup>
  );
};

export default TextInputDiff;
