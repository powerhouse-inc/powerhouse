import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";

type HomeScreenItemProps = {
  readonly icon?: React.JSX.Element;
  readonly title: string;
  readonly description?: string;
  readonly containerClassName?: string;
  readonly shareable?: boolean;
  readonly onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
};
export const HomeScreenItem = function HomeScreenItem(
  props: HomeScreenItemProps,
) {
  const { icon, title, description, containerClassName, shareable, onClick } =
    props;
  return (
    <div
      className={twMerge(
        "hover-bg-transparent relative flex h-24 w-40 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md p-2 text-center text-sm text-black dark:text-slate-50",
        containerClassName,
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
      <div className="mx-auto pb-2">
        {icon || (
          <div className="size-8 items-center justify-center rounded-lg bg-black pt-1 dark:bg-slate-50">
            <span className="w-6 text-white dark:text-slate-900">
              {title.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="w-full max-w-full">
        <h3 className="w-full max-w-full truncate px-2 text-gray-900 dark:text-slate-50">
          {title}
        </h3>
        {description && (
          <p className="text-gray-500 dark:text-slate-100">{description}</p>
        )}
      </div>
      {shareable && (
        <div className="absolute top-0 left-2 mb-2">
          <Icon name="PeopleFill" width={12} height={12} />
        </div>
      )}
    </div>
  );
};
