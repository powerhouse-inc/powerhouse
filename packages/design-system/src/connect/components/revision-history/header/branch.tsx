import { Icon } from "#design-system";

type Props = {
  readonly branch?: string;
};
export function Branch(props: Props) {
  const { branch = "main" } = props;

  return (
    <button className="flex h-8 w-fit items-center gap-1 rounded-lg bg-background pr-2 pl-1 text-xs text-foreground">
      <Icon name="Branch" />
      <span>BRANCH</span>
      <span className="text-foreground">{branch}</span>
    </button>
  );
}
