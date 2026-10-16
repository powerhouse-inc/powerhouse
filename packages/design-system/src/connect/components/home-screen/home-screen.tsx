import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { HomeBackgroundImage } from "./home-background-image.js";

type HomeScreenProps = {
  readonly children: React.ReactNode;
  readonly containerClassName?: string;
  readonly homeBackground?: string | null;
};

export const HomeScreen = function HomeScreen(props: HomeScreenProps) {
  const { children, containerClassName, homeBackground } = props;
  // The page colour behind a custom background: its outer top-left pixel,
  // sampled once the image has loaded, so the art blends into the page.
  const [fill, setFill] = useState<{ src: string; color: string } | null>(null);
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
  // A custom background sits in the bottom-right corner at its own aspect,
  // capped at 1280x720 CSS px and scaled down to fit smaller panes; the rest
  // of the page takes the colour of its outer top-left pixel. The image
  // comes first in the DOM and the content is positioned after it, so the
  // tiles paint above it.
  const pageColor = fill?.src === homeBackground ? fill.color : undefined;
  return (
    <div
      className="relative size-full overflow-hidden"
      style={pageColor ? { backgroundColor: pageColor } : undefined}
    >
      <img
        src={homeBackground}
        alt=""
        className="pointer-events-none absolute right-0 bottom-0 max-h-[min(100%,720px)] max-w-[min(100%,1280px)] object-contain object-bottom-right"
        // feather the top and left edges into the page colour: background
        // art is lighter inside than at its corner pixel, so a hard edge
        // would show as a seam once the image no longer spans the pane
        style={{
          maskImage:
            "linear-gradient(to right, transparent, #000 20%), linear-gradient(to bottom, transparent, #000 20%)",
          maskComposite: "intersect",
        }}
        onLoad={(event) => {
          const color = topLeftPixel(event.currentTarget);
          if (color) setFill({ src: homeBackground, color });
        }}
      />
      {content}
    </div>
  );
};

/** The image's top-left pixel as a CSS colour, or undefined when the canvas
 * cannot read it (a cross-origin image without CORS taints the canvas). */
function topLeftPixel(img: HTMLImageElement): string | undefined {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return undefined;
  }
}
