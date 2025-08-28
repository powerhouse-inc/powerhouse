import { Icon } from "@powerhousedao/design-system";

type Props = {
  readonly branch?: string;
};
export function Branch(props: Props) {
  const { branch = "main" } = props;

  return (
    <button className="flex h-8 items-center gap-1 rounded-lg bg-slate-50 pl-1 pr-2 text-xs text-slate-100">
      <Icon name="Branch" />
      <span>BRANCH</span>
      <span className="text-gray-900">{branch}</span>
    </button>
  );
}
