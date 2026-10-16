import { twMerge } from "tailwind-merge";
import { HomeBackgroundImage } from "./home-background-image.js";

type HomeScreenProps = {
  readonly children: React.ReactNode;
  readonly containerClassName?: string;
  readonly homeBackground?: string | null;
};

export const HomeScreen = function HomeScreen(props: HomeScreenProps) {
  const { children, containerClassName, homeBackground } = props;
  const content = (
    <div
      className={twMerge(
        "relative container mx-auto flex h-full flex-col",
        containerClassName,
      )}
    >
      <div
        className={twMerge(
          "m-8 flex flex-wrap justify-center gap-4 pt-12",
          // the default gradient sits behind an opaque tile band; over a
          // custom background the tiles sit on a translucent panel so their
          // labels stay readable on any art
          homeBackground
            ? "rounded-2xl bg-background/75 px-6 pb-6 backdrop-blur-sm"
            : "bg-background",
        )}
      >
        {!homeBackground && <HomeBackgroundImage />}
        {children}
      </div>
    </div>
  );
  if (!homeBackground) return content;
  // A custom background fills the whole pane behind the tiles (cover,
  // anchored bottom-right where background art keeps its subject). The
  // image comes first in the DOM and the content is positioned after it, so
  // the tiles paint above it.
  return (
    <div className="relative size-full overflow-hidden">
      <img
        src={homeBackground}
        alt=""
        className="pointer-events-none absolute inset-0 size-full object-cover object-bottom-right"
      />
      {content}
    </div>
  );
};
