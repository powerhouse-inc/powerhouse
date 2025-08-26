---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import type { EditorModule } from 'document-model';
import Editor from './editor.js';

export const module: EditorModule = {
    Component: Editor,
    documentTypes: [<% if(!documentTypes.length){ %>'*'<% } else { %><% documentTypes.forEach(type => { _%>"<%= type %>", %><% }); _%> <% } %>],
    config: {
        id: '<%= editorId || 'editor-id' %>',
        disableExternalControls: true,
        documentToolbarEnabled: true,
        showSwitchboardLink: true,
    },
};

export default module;