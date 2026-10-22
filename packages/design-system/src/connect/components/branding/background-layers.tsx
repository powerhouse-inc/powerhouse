import type {
  PHBackground,
  PHBackgroundLayer,
} from "@powerhousedao/shared/clis";
import {
  colorVariants,
  imageVariants,
  layerStyle,
  normalizeBackground,
} from "@powerhousedao/shared/connect";
import type { CSSProperties, PropsWithChildren } from "react";
import { twMerge } from "tailwind-merge";

/**
 * A decorated pane: the configured page colour with the background's layers
 * painted over it, in order, and the children above them all. Each layer is
 * placed by the shared `layerStyle`, the same declarations the desktop
 * loading page emits as static CSS, so a background configured once looks
 * the same in both hosts. Images come resolved (data URIs or URLs); a
 * light/dark pair follows the `.dark` theme class, not the OS scheme.
 * Without a background the pane is the theme's page colour and nothing more.
 */
export function BackgroundLayers(
  props: PropsWithChildren<{
    background: PHBackground | null | undefined;
    className?: string;
  }>,
) {
  const background = normalizeBackground(props.background);
  const color = colorVariants(background?.color);
  const style = color
    ? ({
        "--ph-pane-bg": color.light,
        "--ph-pane-bg-dark": color.dark ?? color.light,
      } as CSSProperties)
    : undefined;
  return (
    <div
      className={twMerge(
        "relative size-full overflow-hidden",
        color
          ? "bg-(--ph-pane-bg) dark:bg-(--ph-pane-bg-dark)"
          : "bg-background",
        props.className,
      )}
      style={style}
    >
      {background?.layers.map((layer, index) => (
        <BackgroundLayer key={index} layer={layer} />
      ))}
      {props.children}
    </div>
  );
}

function BackgroundLayer({ layer }: { layer: PHBackgroundLayer }) {
  const { light, dark } = imageVariants(layer.src);
  const style = layerStyle(layer) as CSSProperties;
  if (!dark) return <img src={light} alt="" style={style} />;
  return (
    <>
      <img src={light} alt="" style={style} className="dark:hidden" />
      <img src={dark} alt="" style={style} className="hidden dark:block" />
    </>
  );
}
