---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/module.ts"
force: true
---
import type { EditorModule } from 'document-model';
import { Editor } from './editor.js';

/** Document editor module for the Todo List document type */
export const <%= pascalCaseEditorName %>: EditorModule = {
    Component: Editor,
    documentTypes: [<% if(!documentTypes.length){ %>'*'<% } else { %><% documentTypes.forEach(type => { _%>"<%= type %>", %><% }); _%> <% } %>],
    config: {
        id: '<%= editorId || paramCaseEditorName %>',
        name: '<%= name || pascalCaseEditorName %>',
    },
};