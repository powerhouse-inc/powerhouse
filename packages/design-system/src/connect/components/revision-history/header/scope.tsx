import { ConnectSelect } from "../../select/select.js";

type Props = {
  readonly scopes: readonly string[];
  readonly value: string;
  readonly onChange: (value: string) => void;
};

function labelFor(scope: string) {
  return `${scope.charAt(0).toUpperCase()}${scope.slice(1)} scope`;
}

export function Scope(props: Props) {
  const { scopes, value, onChange } = props;
  const items = scopes.map((scope) => ({
    displayValue: labelFor(scope),
    value: scope,
  }));

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
