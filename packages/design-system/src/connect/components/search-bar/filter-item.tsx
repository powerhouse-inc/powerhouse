import { mergeClassNameProps } from "@powerhousedao/design-system";

export type FilterItemType = {
  id: string;
  label: string;
  icon?: React.JSX.Element;
};

export interface FilterItemProps extends React.HTMLAttributes<HTMLDivElement> {
  item: FilterItemType;
}

export const FilterItem: React.FC<FilterItemProps> = (props) => {
  const { item, ...containerProps } = props;

  return (
    <div
      {...mergeClassNameProps(
        containerProps,
        "flex h-full flex-row items-center justify-between gap-x-4 px-2",
      )}
    >
      {item.icon}
      <div className="text-sm font-semibold text-slate-200">{item.label}</div>
    </div>
  );
};
