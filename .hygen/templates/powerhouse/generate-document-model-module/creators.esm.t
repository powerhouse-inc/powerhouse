---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/creators.ts"
force: true
---
import { utils<% if (actions.find(a => a.hasAttachment)) {%>, AttachmentInput<%}%> } from 'document-model/document';
import {
<% actions.filter(a => a.hasInput).forEach(action => { _%>
    <%= action.name %>Input,
<% }); _%>
} from '../types';
import {
<% actions.forEach(action => { _%>
    <%= action.name %>Action,
<% }); _%>
} from './actions';

const { createAction } = utils;

<% actions.filter(a => a.hasInput).forEach(action => { _%>
export const <%= h.changeCase.camel(action.name) %> = (input: <%= action.name %>Input<%if(action.hasAttachment){ %>, attachments: AttachmentInput[] <% } %>) =>
    createAction<<%= action.name %>Action>(
        '<%= h.changeCase.constantCase(action.name) %>',
        {...input}<%if(action.hasAttachment){ %>,
        attachments <% } %>
    );

<% }); _%>

<% actions.filter(a => !a.hasInput).forEach(action => { _%>
export const <%= h.changeCase.camel(action.name) %> = () =>
    createAction<<%= action.name %>Action>('<%= h.changeCase.constantCase(action.name) %>');
<% }); _%>