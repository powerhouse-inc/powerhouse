import { ReactElement } from 'react';

interface EditorToolbarComponent {}

interface EditorToolbarProps {
    left?: ReactElement<EditorToolbarComponent>[];
    center?: ReactElement<EditorToolbarComponent>[];
    right?: ReactElement<EditorToolbarComponent>[];
}

function EditorToolbar(props: EditorToolbarProps) {
    const left = props.left || [],
        center = props.center || [],
        right = props.right || [];

    return (
        <div className="editor-toolbar">
            <div className="editor-toolbar--column editor-toolbar--left">
                {left}
            </div>
            <div className="editor-toolbar--column editor-toolbar--center">
                {center}
            </div>
            <div className="editor-toolbar--column editor-toolbar--right">
                {right}
            </div>
        </div>
    );
}

export default EditorToolbar;
