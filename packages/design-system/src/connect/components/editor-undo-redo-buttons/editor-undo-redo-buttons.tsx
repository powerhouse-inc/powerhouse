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
    "w-8 h-8 rounded-lg flex justify-center items-center rounded border border-border bg-background";
  return (
    <div className="flex gap-x-2 text-muted-foreground">
      <button className={buttonStyles} disabled={!canUndo} onClick={undo}>
        <Icon
          className={twMerge(
            "-scale-x-100",
            canUndo
              ? "text-foreground active:active-effect"
              : "text-muted-foreground",
          )}
          name="RedoArrow"
          size={18}
        />
      </button>
      <button className={buttonStyles} disabled={!canRedo} onClick={redo}>
        <Icon
          className={twMerge(
            canRedo
              ? "text-foreground active:active-effect"
              : "text-muted-foreground",
          )}
          name="RedoArrow"
          size={18}
        />
      </button>
    </div>
  );
}
