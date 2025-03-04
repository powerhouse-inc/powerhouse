import { twMerge } from "tailwind-merge";

type SidebarItemProps = {
  readonly icon?: React.JSX.Element;
  readonly title: string;
  readonly description?: string;
  readonly containerClassName?: string;
  readonly active?: boolean;
  readonly onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
};
export const SidebarItem = function SidebarItem(props: SidebarItemProps) {
  const { icon, title, description, containerClassName, active, onClick } =
    props;
  return (
    <div
      className={twMerge(
        "relative flex cursor-pointer flex-col items-center justify-center text-center text-sm text-black",
        containerClassName,
        active && "bg-white",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
      <div className="mx-auto py-4">
        {icon || (
          <div className="size-8 items-center justify-center rounded-lg bg-black pt-1">
            <span className="text-6 w-6 text-white">
              {title.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      {/* {shareable && (
        <div className="mb-4 flex w-full justify-start">
          <div className="absolute left-8 top-8 ">
            <PeopleFill width={12} height={12} />
          </div>
        </div>
      )} */}
    </div>
  );
};
