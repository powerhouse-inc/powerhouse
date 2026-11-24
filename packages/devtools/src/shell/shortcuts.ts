import { useEffect, useRef } from "react";

/** Matched on `event.code`: macOS Option combinations change `event.key`. */
const TOGGLE_CODE = "KeyD";
const PALETTE_CODE = "KeyK";

function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function label(key: string): string {
  return isApplePlatform() ? `⌥⇧${key}` : `Alt+Shift+${key}`;
}

export const toggleShortcutLabel = () => label("D");
export const paletteShortcutLabel = () => label("K");

const EDITABLE = "input, textarea, select, [contenteditable]";

/** Whether the key was typed into a field of the app's. On macOS the
 * shortcuts' keys type characters, which a field of the app keeps. */
function typedIntoTheApp(event: KeyboardEvent): boolean {
  const [target] = event.composedPath();
  return (
    target instanceof Element &&
    target.closest(EDITABLE) !== null &&
    target.closest(".ph-devtools") === null
  );
}

/**
 * Keeps the keys typed into a field of DevTools inside `root`. Past it, the
 * app's listeners would get them on DevTools' element, as keys typed outside
 * any field. The shortcuts listen in the capture phase, so they still see them.
 */
export function keepFieldKeysInside(root: ShadowRoot): void {
  const stop = (event: Event) => {
    const [origin] = event.composedPath();
    if (origin instanceof Element && origin.closest(EDITABLE) !== null) {
      event.stopPropagation();
    }
  };
  for (const type of ["keydown", "keyup", "keypress"]) {
    root.addEventListener(type, stop);
  }
}

export function useShortcuts(handlers: {
  onToggle?: () => void;
  onPalette?: () => void;
}) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey)
        return;
      const handler =
        event.code === TOGGLE_CODE
          ? latest.current.onToggle
          : event.code === PALETTE_CODE
            ? latest.current.onPalette
            : undefined;
      if (!handler || typedIntoTheApp(event)) return;
      event.preventDefault();
      // A held key repeats: it is still one press.
      if (event.repeat) return;
      handler();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
