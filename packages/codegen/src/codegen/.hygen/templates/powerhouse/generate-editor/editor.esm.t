---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
<% if(!documentTypes.length){ %>import { Action, EditorProps } from 'document-model';<% } else { %>import { EditorProps } from 'document-model';<% } %>
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type].name %>Document, actions } from "<%= documentTypesMap[type].importPath %>";
%><% }); _%>
import { Button } from '@powerhousedao/design-system';

export type IProps = <% if(!documentTypes.length){ %>EditorProps<unknown, Action><% } else { %><% documentTypes.forEach((type, index) => { _%>EditorProps<<%= documentTypesMap[type].name %>Document%>%>><% if(index < documentTypes.length - 1){ %> | <% }%><% }); _%> <% } %>;

export default function Editor(props: IProps) {
    return (
        <div>
            <Button onClick={() => console.log('Hello world!')}>My Button</Button>
        </div>
    );
};