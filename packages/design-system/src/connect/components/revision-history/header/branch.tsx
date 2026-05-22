import { Icon } from "#design-system";

type Props = {
  readonly branch?: string;
};
export function Branch(props: Props) {
  const { branch = "main" } = props;

  return (
    <button className="flex h-8 w-fit items-center gap-1 rounded-lg bg-slate-50 pr-2 pl-1 text-xs text-stone-300 dark:bg-slate-900">
      <Icon name="Branch" />
      <span>BRANCH</span>
      <span className="text-gray-900 dark:text-slate-50">{branch}</span>
    </button>
  );
}
