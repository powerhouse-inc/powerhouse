import type { PHBackground } from "@powerhousedao/shared/clis";
import { normalizeBackground } from "@powerhousedao/shared/connect";
import { twMerge } from "tailwind-merge";
import { BackgroundLayers } from "../branding/background-layers.js";
import { HomeBackgroundImage } from "./home-background-image.js";

type HomeScreenProps = {
  readonly children: React.ReactNode;
  readonly containerClassName?: string;
  /** The project's background (`connect.branding.homeBackground`, images
   * resolved); null or undefined keeps the bundled gradient. */
  readonly homeBackground?: PHBackground | null;
};

export const HomeScreen = function HomeScreen(props: HomeScreenProps) {
  const { children, containerClassName } = props;
  const background = normalizeBackground(props.homeBackground);
  const content = (
    <div
      className={twMerge(
        "relative isolate container mx-auto flex h-full flex-col",
        containerClassName,
      )}
    >
      {!background && <HomeBackgroundImage />}
      {/* Above the background, but isolated so a portalled modal paints over it. */}
      <div
        className={twMerge(
          "relative z-10 m-8 flex flex-wrap justify-center gap-4 pt-12",
          // tiles sit on the default gradient; over project art they get a
          // translucent panel so their labels stay readable
          background &&
            "rounded-2xl bg-background/75 px-6 pb-6 backdrop-blur-sm",
        )}
      >
        {children}
      </div>
    </div>
  );
  if (!background) return content;
  // The layers come first in the DOM and the content after them, so the
  // tiles paint above the art.
  return <BackgroundLayers background={background}>{content}</BackgroundLayers>;
};
