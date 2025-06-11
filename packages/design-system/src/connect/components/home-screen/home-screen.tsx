import { twMerge } from "tailwind-merge";
import { HomeBackgroundImage } from "./home-background-image.js";

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
        <HomeBackgroundImage />
        {children}
      </div>
    </div>
  );
};
