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
      <HomeBackgroundImage src={homeBackground ?? undefined} />
      {/* Its own layer, so every card paints above the fixed background. */}
      <div className="relative z-10 m-8 flex flex-wrap justify-center gap-4 pt-12">
        {children}
      </div>
    </div>
  );
};
