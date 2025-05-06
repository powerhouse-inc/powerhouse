---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
<% if(!documentTypes.length){ %>import type { EditorProps, PHDocument } from 'document-model';<% } else { %>import type { EditorProps } from 'document-model';<% } %>
<% documentTypes.forEach(type => { _%>
import { type <%= documentTypesMap[type].name %>Document, actions } from "<%= documentTypesMap[type].importPath %>/index.js";
%><% }); _%>
import { Button } from '@powerhousedao/design-system';

export type IProps = <% if(!documentTypes.length){ %>EditorProps<PHDocument><% } else { %><% documentTypes.forEach((type, index) => { _%>EditorProps<<%= documentTypesMap[type].name %>Document%>%>><% if(index < documentTypes.length - 1){ %> | <% }%><% }); _%> <% } %>;

export default function Editor(props: IProps) {
    return (
        <div>
            <Button onClick={() => console.log('Hello world!')}>My Button</Button>
        </div>
    );
};