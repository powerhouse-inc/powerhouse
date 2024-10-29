---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { ExtendedEditor, EditorContextProps } from 'document-model-libs';
import Editor from './editor';
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type] %>State, <%= documentTypesMap[type] %>Action, <%= documentTypesMap[type] %>LocalState } from "../.<%= documentModelsDir %>/<%= h.changeCase.param(documentTypesMap[type]) %>";
%><% }); _%>

export const module: <% if(!documentTypes.length){ %>ExtendedEditor<unknown, Action, unknown, unknown><% } else { %><% documentTypes.forEach((type, index) => { _%>ExtendedEditor<<%= documentTypesMap[type] %>State, <%= documentTypesMap[type] %>Action, <%= documentTypesMap[type] %>LocalState, EditorContextProps%>%>> <% if(index < documentTypes.length - 1){ %>| <% }%><% }); _%> <% } %>= {
    Component: Editor,
    documentTypes: [<% if(!documentTypes.length){ %>'*'<% } else { %><% documentTypes.forEach(type => { _%>"<%= type %>", %><% }); _%> <% } %>],
    config: {
        id: 'editor-id',
        disableExternalControls: true,
        documentToolbarEnabled: true,
    },
};

export default module;