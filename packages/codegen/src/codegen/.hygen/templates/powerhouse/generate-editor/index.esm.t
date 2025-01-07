---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { ExtendedEditor, EditorContextProps } from 'document-model-libs';
import Editor from './editor';
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type].name %>State, <%= documentTypesMap[type].name %>Action, <%= documentTypesMap[type].name %>LocalState } from "<%= documentTypesMap[type].importPath %>";
%><% }); _%>

export const module: <% if(!documentTypes.length){ %>ExtendedEditor<unknown, Action, unknown, unknown><% } else { %><% documentTypes.forEach((type, index) => { _%>ExtendedEditor<<%= documentTypesMap[type].name %>State, <%= documentTypesMap[type].name %>Action, <%= documentTypesMap[type].name %>LocalState, EditorContextProps%>%>> <% if(index < documentTypes.length - 1){ %>| <% }%><% }); _%> <% } %>= {
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