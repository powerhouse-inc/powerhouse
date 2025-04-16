import { twMerge } from "tailwind-merge";

export interface HDividerProps {
  className?: string;
}

export const HDivider = (props: HDividerProps) => {
  const { className } = props;

  return (
    <div
      className={twMerge(
        "mx-0.5 flex h-[25px] w-1.5 flex-col items-center justify-center rounded-[2px] hover:bg-blue-300",
        className,
      )}
    >
      <div className="h-0.5 w-1 rounded-full bg-gray-500" />
    </div>
  );
};
