import {
  type DivProps,
  mergeClassNameProps,
} from "@powerhousedao/design-system";

export interface RWAFormRowProps extends DivProps {
  readonly label?: React.ReactNode;
  readonly value?: React.ReactNode;
}

export const RWAFormRow: React.FC<RWAFormRowProps> = ({
  label,
  value,
  ...divProps
}) => (
  <div {...mergeClassNameProps(divProps, "flex items-center px-6 text-xs")}>
    <div className="text-gray-600">{label}</div>
    <div className="text-gray-900">{value ? value : "--"}</div>
  </div>
);
