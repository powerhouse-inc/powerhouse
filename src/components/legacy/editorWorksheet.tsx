import { PropsWithChildren } from 'react';

interface EditorWorksheetProps {
    onClick?: () => void;
}

export function EditorWorksheet(
    props: PropsWithChildren<EditorWorksheetProps>,
) {
    return (
        <div className="editor-worksheet">
            <div className="editor-worksheet--page">{props.children}</div>
        </div>
    );
}
