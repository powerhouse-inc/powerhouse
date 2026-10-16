import { useConnectIcons } from "@powerhousedao/reactor-browser";
import { useEffect } from "react";

const MARK = "data-project-favicon";

/**
 * Project favicons (proof of concept): when the project declares an app icon,
 * one `<link rel="icon" sizes>` per variant the runner found
 * (`<name>_16x16.png`, `_32x32`, `_64x64`) goes into the head, ahead of the
 * static `icon.ico` link, so the browser picks the best size. Without
 * project icons nothing changes.
 */
export function ProjectFavicon() {
  const icons = useConnectIcons();
  const variants = icons?.appVariants;
  useEffect(() => {
    if (!variants || variants.length === 0) return;
    const links = variants.map(({ size, src }) => {
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = src.startsWith("data:image/svg")
        ? "image/svg+xml"
        : "image/png";
      link.sizes = `${size}x${size}`;
      link.href = src;
      link.setAttribute(MARK, "");
      return link;
    });
    document.head.prepend(...links);
    return () => {
      for (const link of links) link.remove();
    };
  }, [variants]);
  return null;
}
