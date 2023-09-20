---
to: "<%= rootDir %>/<%= name %>/index.ts"
force: true
---
import Editor from './editor';
import { EditorModule } from '../common';

const Module: EditorModule = {
    Component: Editor,
    documentTypes: [/* TODO */],
};

export default Module;