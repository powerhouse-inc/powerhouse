---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { EditorModule } from 'document-model';
import Editor from './editor';
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>";
%><% }); _%>

export const module: <% if(!documentTypes.length){ %>EditorModule<% } else { %><% documentTypes.forEach((type, index) => { _%>EditorModule<<%= documentTypesMap[type].name %>Document%>%>> <% if(index < documentTypes.length - 1){ %>| <% }%><% }); _%> <% } %>= {
    Component: Editor,
    documentTypes: [<% if(!documentTypes.length){ %>'*'<% } else { %><% documentTypes.forEach(type => { _%>"<%= type %>", %><% }); _%> <% } %>],
    config: {
        id: 'editor-id',
        disableExternalControls: true,
        documentToolbarEnabled: true,
        showSwitchboardLink: true,
    },
};

export default module;