import { FormGroup, FormLabel } from "@powerhousedao/design-system/scalars";
import { SplittedInputDiff } from "../input/splitted-input-diff.js";
import type { SelectProps, SelectWithDifference } from "./types.js";

interface SelectDiffProps extends SelectWithDifference {
  value: string;
  label: SelectProps["label"];
  required: SelectProps["required"];
}

const SelectDiff = ({
  value = "",
  label,
  required,
  viewMode,
  diffMode = "sentences",
  baseValue = "",
}: SelectDiffProps) => {
  return (
    <FormGroup>
      {label && (
        <FormLabel disabled={true} required={required}>
          {label}
        </FormLabel>
      )}
      <SplittedInputDiff
        baseValue={baseValue}
        value={value}
        viewMode={viewMode}
        diffMode={diffMode}
      />
    </FormGroup>
  );
};

export { SelectDiff };
