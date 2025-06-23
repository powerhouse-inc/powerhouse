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
            <div className="html-defaults-container">
                <h1>This h1 will be styled</h1>
                <p>This paragraph will also be styled.</p>
                <button>Styled Button</button>
            </div>
            <div>
                <h1>This h1 outside the container will NOT be styled by html-defaults.css</h1>
            </div>
        </div>
    );
};