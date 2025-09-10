import type { SelectOption } from "#ui";
import { SelectFieldRaw } from "#ui";
import { useCallback } from "react";

export type PackageManagerReactorSelectProps = {
  reactorOptions: SelectOption[];
  reactor: string;
  className?: string;
  onReactorChange: (value?: string) => void;
};

export const PackageManagerReactorSelect: React.FC<
  PackageManagerReactorSelectProps
> = (props) => {
  const { reactorOptions, reactor, onReactorChange, ...rest } = props;

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
        options={reactorOptions}
        multiple={false}
        onChange={handleChange}
      />
    </div>
  );
};
