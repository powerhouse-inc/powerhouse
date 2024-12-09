---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
<% if(!documentTypes.length){ %>import { Action, EditorProps } from 'document-model/document';<% } else { %>import { EditorProps } from 'document-model/document';<% } %>
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type].name %>State, <%= documentTypesMap[type].name %>Action, <%= documentTypesMap[type].name %>LocalState, actions } from "<%= documentTypesMap[type].importPath %>";
%><% }); _%>
import { utils as documentModelUtils } from 'document-model/document';
import { Button } from '@powerhousedao/design-system';

export type IProps = <% if(!documentTypes.length){ %>EditorProps<unknown, Action><% } else { %><% documentTypes.forEach((type, index) => { _%>EditorProps<<%= documentTypesMap[type].name %>State, <%= documentTypesMap[type].name %>Action, <%= documentTypesMap[type].name %>LocalState%>%>><% if(index < documentTypes.length - 1){ %> | <% }%><% }); _%> <% } %>;

export default function Editor(props: IProps) {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    return (
        <div>
            <Button onClick={() => console.log('Hello world!')}>My Button</Button>
        </div>
    );
};