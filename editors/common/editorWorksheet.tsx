import { PropsWithChildren } from 'react';

interface EditorWorksheetProps {
    onClick?: () => void;
}

function EditorWorksheet(props: PropsWithChildren<EditorWorksheetProps>) {
    return (
        <div className="editor-worksheet">
            <div className="editor-worksheet--page">{props.children}</div>
        </div>
    );
}

export default EditorWorksheet;
