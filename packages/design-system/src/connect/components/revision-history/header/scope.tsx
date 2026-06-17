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
      containerClassName="z-10 w-fit rounded-lg bg-background text-xs text-muted-foreground"
      id="scope select"
      itemClassName="grid grid-cols-[auto,auto] gap-1 py-2 text-muted-foreground"
      items={items}
      menuClassName="min-w-0 text-muted-foreground"
      onChange={onChange}
      value={value}
    />
  );
}
