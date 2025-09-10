import type { ReactElement } from "react";

interface EditorToolbarProps {
  readonly left?: ReactElement<ReactElement>[];
  readonly center?: ReactElement<ReactElement>[];
  readonly right?: ReactElement<ReactElement>[];
}

export function EditorToolbar(props: EditorToolbarProps) {
  const left = props.left || [];
  const center = props.center || [];
  const right = props.right || [];

  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar--column editor-toolbar--left">{left}</div>
      <div className="editor-toolbar--column editor-toolbar--center">
        {center}
      </div>
      <div className="editor-toolbar--column editor-toolbar--right">
        {right}
      </div>
    </div>
  );
}
