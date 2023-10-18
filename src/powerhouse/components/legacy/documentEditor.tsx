import { PropsWithChildren } from 'react';

interface DocumentEditorProps {
    mode: 'light' | 'dark';
}

export function DocumentEditor(props: PropsWithChildren<DocumentEditorProps>) {
    const classes = ['document-editor', `${props.mode}-mode`];

    return <div className={classes.join(' ')}>{props.children}</div>;
}
