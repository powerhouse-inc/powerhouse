import type { WithDifference } from "@powerhousedao/design-system/ui";
import {
  FormGroup,
  FormLabel,
  SplittedInputDiff,
} from "@powerhousedao/design-system/ui";
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
