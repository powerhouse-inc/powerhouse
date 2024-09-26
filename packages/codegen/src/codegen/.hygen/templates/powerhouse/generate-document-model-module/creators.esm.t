---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/creators.ts"
force: true
---
import { utils<% if (actions.find(a => a.hasAttachment)) {%>, AttachmentInput<%}%> } from 'document-model/document';
import { z,
<% actions.filter(a => a.hasInput).forEach(action => { _%>
    <%= h.changeCase.pascal(action.name) %>Input,
<% }); _%>
} from '../types';
import {
<% actions.forEach(action => { _%>
    <%= h.changeCase.pascal(action.name) %>Action,
<% }); _%>
} from './actions';

const { createAction } = utils;

<% actions.filter(a => a.hasInput).forEach(action => { _%>
export const <%= h.changeCase.camel(action.name) %> = (input: <%= h.changeCase.pascal(action.name) %>Input<%if(action.hasAttachment){ %>, attachments: AttachmentInput[] <% } %>) =>
    createAction<<%= h.changeCase.pascal(action.name) %>Action>(
        '<%= h.changeCase.constantCase(action.name) %>',
        {...input},
        <%if(action.hasAttachment){ %>attachments<% } else { %>undefined<% } %>,
        z.<%= h.changeCase.pascalCase(action.name) %>InputSchema,
        '<%= action.scope %>'
    );

<% }); _%>

<% actions.filter(a => !a.hasInput).forEach(action => { _%>
export const <%= h.changeCase.camel(action.name) %> = () =>
    createAction<<%= h.changeCase.pascal(action.name) %>Action>('<%= h.changeCase.constantCase(action.name) %>');
<% }); _%>