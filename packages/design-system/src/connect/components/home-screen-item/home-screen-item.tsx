import PeopleFill from "@/assets/icon-components/PeopleFill";
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
        "relative flex flex-col items-center text-center text-sm text-black",
        containerClassName,
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
      <div className="mx-auto pb-4">
        {icon || (
          <div className="size-[32px] items-center justify-center rounded-lg bg-black pt-1 ">
            <span className=" w-[24px] text-[24px] text-white">
              {title.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div>
        <h3>{title}</h3>
        {description && <p className="text-gray-500">{description}</p>}
      </div>
      {shareable && (
        <div className="mb-4 flex w-full justify-start">
          <div className="absolute left-8 top-8 ">
            <PeopleFill width={12} height={12} />
          </div>
        </div>
      )}
    </div>
  );
};
