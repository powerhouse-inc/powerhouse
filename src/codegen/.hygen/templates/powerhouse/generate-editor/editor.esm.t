---
to: "<%= rootDir %>/<%= name %>/editor.ts"
unless_exists: true
---
import { Action } from 'document-model/document';
import { EditorProps } from '../common';

export type IProps = EditorProps<unknown, Action>;

export default function Editor(props: IProps) {
    return null;
};