---
to: "<%= rootDir %>/<%= name %>/editor.tsx"
unless_exists: true
---
<% if(!documentTypes.length){ %>import { Action } from 'document-model/document';<% } %>
import { EditorProps } from 'document-model-libs/utils';
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type] %>State, <%= documentTypesMap[type] %>Action } from "../.<%= documentModelsDir %>/<%= h.changeCase.param(documentTypesMap[type]) %>";
%><% }); _%>

export type IProps = <% if(!documentTypes.length){ %>EditorProps<unknown, Action><% } else { %><% documentTypes.forEach((type, index) => { _%>EditorProps<<%= documentTypesMap[type] %>State, <%= documentTypesMap[type] %>Action%>%>><% if(index < documentTypes.length - 1){ %> | <% }%><% }); _%> <% } %>;

export default function Editor(props: IProps) {
    return <></>;
};