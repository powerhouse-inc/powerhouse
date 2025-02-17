import { Icon } from "@/powerhouse";
import { ComponentPropsWithRef, ForwardedRef, forwardRef } from "react";
import { twMerge } from "tailwind-merge";
import { HomeScreenItem } from "../home-screen-item";
type InputProps = ComponentPropsWithRef<"input">;
type HomeScreenProps = Omit<InputProps, "className"> & {
  readonly children: React.ReactNode;
  readonly containerClassName?: string;
};
export const HomeScreen = forwardRef(function HomeScreen(
  props: HomeScreenProps,
  ref: ForwardedRef<HTMLInputElement>,
) {
  const { children, containerClassName } = props;
  return (
    <div>
      <div
        className={twMerge(
          "container flex h-screen flex-wrap justify-center gap-4 bg-[url(/home-bg.png)] bg-cover bg-center p-8 text-gray-800 placeholder:text-gray-500",
          containerClassName,
        )}
      >
        {children}
        <HomeScreenItem
          title="Create New Drive"
          icon={<Icon name="PlusSquare" size={32} />}
        />
      </div>
    </div>
  );
});
