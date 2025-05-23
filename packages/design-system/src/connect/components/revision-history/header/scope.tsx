import { type OperationScope } from "document-model";
import { Select } from "../../select/index.js";

type Props = {
  readonly value: OperationScope;
  readonly onChange: (value: OperationScope) => void;
};
export function Scope(props: Props) {
  const { value, onChange } = props;
  const items = [
    { displayValue: "Global scope", value: "global" },
    { displayValue: "Local scope", value: "local" },
  ] as const;

  return (
    <Select
      absolutePositionMenu
      containerClassName="bg-slate-50 text-gray-500 rounded-lg w-fit text-xs z-10"
      id="scope select"
      itemClassName="py-2 text-gray-500 grid grid-cols-[auto,auto] gap-1"
      items={items}
      menuClassName="min-w-0 text-gray-500"
      onChange={onChange}
      value={value}
    />
  );
}
