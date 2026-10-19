import type { PHNavigationTarget } from "@powerhousedao/reactor-browser";
import type { MouseEvent } from "react";
import { openTargetWith, targetPathname } from "./navigation.js";
import { usePHNavigation } from "./url-state.js";

type ClickLike = Pick<
  MouseEvent,
  | "button"
  | "metaKey"
  | "ctrlKey"
  | "shiftKey"
  | "altKey"
  | "defaultPrevented"
  | "preventDefault"
>;

/** A plain primary click; modified and other-button clicks stay the browser's. */
export function isPlainClick(event: ClickLike) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export type LinkProps = {
  href: string;
  onClick: (event: ClickLike) => void;
  onMouseEnter: () => void;
  onFocus: () => void;
  "aria-current"?: "page";
};

/** Props for an `<a>` that opens `target` in the app on a plain click, and
 * leaves new tabs and windows to the browser; acts on the store in context. */
export function useLinkProps(
  target: PHNavigationTarget | undefined,
  open?: () => void,
): LinkProps {
  const navigation = usePHNavigation();
  const href = navigation.hrefFor?.(target) ?? targetPathname(target);
  const isCurrent = navigation.useIsCurrent?.(target) ?? false;
  const preload = () => navigation.preload?.(target);
  const openTarget = open ?? (() => openTargetWith(navigation, target));
  return {
    href,
    onClick: (event) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      openTarget();
    },
    onMouseEnter: preload,
    onFocus: preload,
    "aria-current": isCurrent ? "page" : undefined,
  };
}
