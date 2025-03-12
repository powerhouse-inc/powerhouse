import { Icon } from "#powerhouse";
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
    "w-8 h-8 rounded-lg flex justify-center items-center rounded border border-gray-200";
  return (
    <div className="flex gap-x-2 text-gray-500">
      <button className={buttonStyles} disabled={!canUndo} onClick={undo}>
        <Icon
          className={twMerge(
            "-scale-x-100",
            canUndo ? "text-gray-900 active:opacity-50" : "text-gray-500",
          )}
          name="RedoArrow"
          size={18}
        />
      </button>
      <button className={buttonStyles} disabled={!canRedo} onClick={redo}>
        <Icon
          className={twMerge(
            canRedo ? "text-gray-900 active:opacity-50" : "text-gray-500",
          )}
          name="RedoArrow"
          size={18}
        />
      </button>
    </div>
  );
}
