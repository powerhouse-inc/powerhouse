import { SelectOption } from "@/scalars/components/enum-field/types";
import { SelectFieldRaw } from "@/scalars/components/fragments/select-field";
import { ComponentPropsWithoutRef, useCallback } from "react";

export type PackageManagerReactorSelectProps = {
  readonly options: SelectOption[];
  readonly reactor: string;
  readonly onReactorChange: (value?: string) => void;
} & ComponentPropsWithoutRef<"div">;

export const PackageManagerReactorSelect: React.FC<
  PackageManagerReactorSelectProps
> = (props) => {
  const { options, reactor, onReactorChange, ...rest } = props;

  const handleChange = useCallback(
    (value: string | string[]) => {
      onReactorChange(Array.isArray(value) ? value.at(-1) : value);
    },
    [onReactorChange],
  );

  return (
    <div {...rest}>
      <h3 className="mb-4 font-semibold text-gray-900">Select Reactor</h3>
      <SelectFieldRaw
        className="min-w-36 max-w-fit"
        name="reactor"
        required
        value={reactor}
        options={options}
        multiple={false}
        onChange={handleChange}
      />
    </div>
  );
};
