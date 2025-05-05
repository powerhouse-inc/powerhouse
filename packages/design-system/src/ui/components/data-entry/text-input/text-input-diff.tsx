import { FormGroup, FormLabel } from "#scalars";
import type { WithDifference } from "../../../../scalars/components/types.js";
import { SplittedInputDiff } from "../input/splitted-input-diff.js";
interface TextInputDiffProps extends WithDifference<string> {
  value: string;
  label?: React.ReactNode;
  required?: boolean;
}
const TextInputDiff = ({
  value,
  label,
  required,
  baseValue = "",
  viewMode = "edition",
  diffMode = "sentences",
}: TextInputDiffProps) => {
  return (
    <FormGroup>
      {label && (
        <FormLabel disabled={true} required={required}>
          {label}
        </FormLabel>
      )}
      <SplittedInputDiff
        value={value}
        baseValue={baseValue}
        diffMode={diffMode}
        viewMode={viewMode}
      />
    </FormGroup>
  );
};

export default TextInputDiff;
