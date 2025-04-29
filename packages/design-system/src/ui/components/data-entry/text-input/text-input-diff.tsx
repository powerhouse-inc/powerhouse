import type { WithDifference } from "../../../../scalars/components/types.js";

interface TextInputDiffProps extends WithDifference<string> {
  value: string;
}

const TextInputDiff = ({
  value,
  viewMode,
  diffMode,
  baseValue,
}: TextInputDiffProps) => {
  return <div>TextInputDiff</div>;
};

export default TextInputDiff;
