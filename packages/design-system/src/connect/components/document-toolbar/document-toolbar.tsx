import {
  EditorUndoRedoButtons,
  type EditorUndoRedoButtonsProps,
} from "@/connect/components/editor-undo-redo-buttons";
import {
  EditorActionButtons,
  type EditorActionButtonsProps,
} from "@/connect/components/editor-action-buttons";
import { twMerge } from "tailwind-merge";

export type DocumentToolbarProps = {
  title?: string;
  className?: string;
} & Partial<EditorUndoRedoButtonsProps> &
  EditorActionButtonsProps;

export const DocumentToolbar: React.FC<DocumentToolbarProps> = (props) => {
  const {
    undo,
    canUndo,
    redo,
    canRedo,
    title,
    onClose,
    onExport,
    className,
    onShowRevisionHistory,
    onSwitchboardLinkClick,
  } = props;

  return (
    <div className={twMerge("flex items-center justify-between", className)}>
      <div>
        {undo && redo && canUndo && canRedo && (
          <EditorUndoRedoButtons
            undo={undo}
            canUndo={canUndo}
            redo={redo}
            canRedo={canRedo}
          />
        )}
      </div>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div>
        <EditorActionButtons
          onClose={onClose}
          onExport={onExport}
          onShowRevisionHistory={onShowRevisionHistory}
          onSwitchboardLinkClick={onSwitchboardLinkClick}
        />
      </div>
    </div>
  );
};
