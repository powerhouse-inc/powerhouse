---
to: "<%= rootDir %>/<%= name %>/index.ts"
force: true
---
import { type Editor as EditorModule<% if(!documentTypes.length){ %>, Action<% } %> } from 'document-model/document';
import Editor from './editor';
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type] %>State, <%= documentTypesMap[type] %>Action } from "../.<%= documentModelsDir %>/<%= h.changeCase.param(documentTypesMap[type]) %>";
%><% }); _%>

export const module: <% if(!documentTypes.length){ %>EditorModule<unknown, Action><% } else { %><% documentTypes.forEach((type, index) => { _%>EditorModule<<%= documentTypesMap[type] %>State, <%= documentTypesMap[type] %>Action%>%>> <% if(index < documentTypes.length - 1){ %>| <% }%><% }); _%> <% } %>= {
    Component: Editor,
    documentTypes: [<% if(!documentTypes.length){ %>'*'<% } else { %><% documentTypes.forEach(type => { _%>"<%= type %>", %><% }); _%> <% } %>],
};

export default module;