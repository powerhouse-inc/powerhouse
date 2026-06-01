import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";

export type EditorUndoRedoButtonsProps = {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
};
export function EditorUndoRedoButtons(props: EditorUndoRedoButtonsProps) {
  const { canUndo, canRedo, undo, redo } = props;
  const buttonStyles =
    "w-8 h-8 rounded-lg flex justify-center items-center rounded border border-gray-200 bg-gray-50 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100";
  return (
    <div className="flex gap-x-2 text-gray-500 dark:text-slate-400">
      <button className={buttonStyles} disabled={!canUndo} onClick={undo}>
        <Icon
          className={twMerge(
            "-scale-x-100",
            canUndo
              ? "text-gray-800 active:opacity-50 dark:text-slate-100"
              : "text-gray-500 dark:text-slate-400",
          )}
          name="RedoArrow"
          size={18}
        />
      </button>
      <button className={buttonStyles} disabled={!canRedo} onClick={redo}>
        <Icon
          className={twMerge(
            canRedo
              ? "text-gray-800 active:opacity-50 dark:text-slate-100"
              : "text-gray-500 dark:text-slate-400",
          )}
          name="RedoArrow"
          size={18}
        />
      </button>
    </div>
  );
}
