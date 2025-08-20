import { useHotkeys } from "react-hotkeys-hook";

export interface UseUndoRedoShortcutsProps {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const useUndoRedoShortcuts = (props: UseUndoRedoShortcutsProps) => {
  const { undo, redo, canRedo, canUndo } = props;
  const isMac = window.navigator.userAgent.includes("Mac");

  let undoShortcut = "ctrl+z";
  let redoShortcut = "ctrl+y";

  if (isMac) {
    undoShortcut = "mod+z";
    redoShortcut = "mod+shift+z";
  }

  // set handler for undo
  useHotkeys(
    undoShortcut,
    (event) => {
      event.preventDefault();
      if (canUndo) {
        undo();
      }
    },
    {},
    [canUndo, undo],
  );

  // set handler for redo
  useHotkeys(
    redoShortcut,
    (event) => {
      event.preventDefault();
      if (canRedo) {
        redo();
      }
    },
    {},
    [canRedo, redo],
  );
};
