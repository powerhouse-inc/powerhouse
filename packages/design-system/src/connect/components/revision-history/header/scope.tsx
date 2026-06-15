import { ConnectSelect } from "../../select/select.js";

type Props = {
  readonly value: string;
  readonly onChange: (value: string) => void;
};
export function Scope(props: Props) {
  const { value, onChange } = props;
  const items = [
    { displayValue: "Global scope", value: "global" },
    { displayValue: "Local scope", value: "local" },
  ] as const;

  return (
    <ConnectSelect
      absolutePositionMenu
      containerClassName="bg-background text-muted-foreground rounded-lg w-fit text-xs z-10"
      id="scope select"
      itemClassName="py-2 text-muted-foreground grid grid-cols-[auto,auto] gap-1"
      items={items}
      menuClassName="min-w-0 text-muted-foreground"
      onChange={onChange}
      value={value}
    />
  );
}
