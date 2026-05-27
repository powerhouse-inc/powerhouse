import { twMerge } from "tailwind-merge";
import { HomeBackgroundImage } from "./home-background-image.js";

type HomeScreenProps = {
  readonly children: React.ReactNode;
  readonly containerClassName?: string;
  readonly homeBackground?: string | null;
};

export const HomeScreen = function HomeScreen(props: HomeScreenProps) {
  const { children, containerClassName, homeBackground } = props;
  return (
    <div
      className={twMerge(
        "relative container mx-auto flex h-full flex-col",
        containerClassName,
      )}
    >
      <div className="m-8 flex flex-wrap justify-center gap-4 bg-white pt-12 dark:bg-slate-900">
        <HomeBackgroundImage src={homeBackground ?? undefined} />
        {children}
      </div>
    </div>
  );
};
