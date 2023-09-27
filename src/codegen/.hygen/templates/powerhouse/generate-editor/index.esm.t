---
to: "<%= rootDir %>/<%= name %>/index.ts"
force: true
---
import { type Editor as EditorModule } from 'document-model/document';
import Editor from './editor';

export const module: EditorModule = {
    Component: Editor,
    documentTypes: [/* TODO */],
};

export default module;