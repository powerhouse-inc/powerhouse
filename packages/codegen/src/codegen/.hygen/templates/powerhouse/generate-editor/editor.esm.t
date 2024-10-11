---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
<% if(!documentTypes.length){ %>import { Action, EditorProps } from 'document-model/document';<% } else { %>import { EditorProps } from 'document-model/document';<% } %>
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type] %>State, <%= documentTypesMap[type] %>Action, <%= documentTypesMap[type] %>LocalState } from "../.<%= documentModelsDir %>/<%= h.changeCase.param(documentTypesMap[type]) %>";
%><% }); _%>

export type IProps = <% if(!documentTypes.length){ %>EditorProps<unknown, Action><% } else { %><% documentTypes.forEach((type, index) => { _%>EditorProps<<%= documentTypesMap[type] %>State, <%= documentTypesMap[type] %>Action, <%= documentTypesMap[type] %>LocalState%>%>><% if(index < documentTypes.length - 1){ %> | <% }%><% }); _%> <% } %>;

export default function Editor(props: IProps) {
    return <></>;
};