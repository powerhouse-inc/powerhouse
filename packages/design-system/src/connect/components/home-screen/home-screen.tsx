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
      <div className="m-8 flex flex-wrap justify-center gap-4 bg-background pt-12">
        {!homeBackground && <HomeBackgroundImage />}
        {children}
      </div>
      {homeBackground && (
        // A custom image is a hero below the drive tiles, in normal flow and
        // contained to the space left — never layered over the tiles (a
        // positioned image paints above them) or drawn at natural size.
        <div className="pointer-events-none flex min-h-0 flex-1 items-center justify-center px-8 pb-8">
          <img
            src={homeBackground}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
    </div>
  );
};
