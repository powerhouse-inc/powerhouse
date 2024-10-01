import { ReactElement } from 'react';

interface EditorToolbarComponent {}

interface EditorToolbarProps {
    readonly left?: ReactElement<EditorToolbarComponent>[];
    readonly center?: ReactElement<EditorToolbarComponent>[];
    readonly right?: ReactElement<EditorToolbarComponent>[];
}

export function EditorToolbar(props: EditorToolbarProps) {
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
