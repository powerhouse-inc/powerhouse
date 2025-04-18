import HomeBg from "#assets/home-bg.png";
import { twMerge } from "tailwind-merge";

type HomeScreenProps = {
  readonly children: React.ReactNode;
  readonly containerClassName?: string;
};
export const HomeScreen = function HomeScreen(props: HomeScreenProps) {
  const { children, containerClassName } = props;
  return (
    <div
      className={twMerge(
        "container relative mx-auto flex h-full flex-col",
        containerClassName,
      )}
    >
      <div className="m-8 flex flex-wrap justify-center gap-4 pt-12">
        <img
          src={HomeBg}
          alt="background"
          className="pointer-events-none absolute inset-8 z-0 size-[calc(100%-32px)] object-contain"
        />
        {children}
      </div>
    </div>
  );
};
