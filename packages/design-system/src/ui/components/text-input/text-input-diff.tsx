import type { WithDifference } from "../../types.js";
import { FormGroup } from "../form-group/index.js";
import { FormLabel } from "../form-label/index.js";
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
