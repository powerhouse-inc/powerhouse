import { twMerge } from "tailwind-merge";

export type FilterItemType = {
  id: string;
  label: string;
  icon?: React.JSX.Element;
};

export interface FilterItemProps extends React.HTMLAttributes<HTMLDivElement> {
  item: FilterItemType;
}

export const FilterItem: React.FC<FilterItemProps> = (props) => {
  const { item, className, ...containerProps } = props;

  return (
    <div
      className={twMerge(
        "flex h-full flex-row items-center justify-between gap-x-4 px-2",
        typeof className === "string" && className,
      )}
      {...containerProps}
    >
      {item.icon}
      <div className="text-sm font-semibold text-gray-200 dark:text-slate-700">
        {item.label}
      </div>
    </div>
  );
};
