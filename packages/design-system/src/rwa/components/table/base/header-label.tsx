import type { DivProps } from "#powerhouse";

export interface RWATableHeaderLabelProps extends DivProps {
  readonly label?: React.ReactNode;
}

export const RWATableHeaderLabel: React.FC<RWATableHeaderLabelProps> = (
  props,
) => {
  const { label, ...divProps } = props;

  return (
    <th scope="col" {...divProps}>
      {label}
    </th>
  );
};
