---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/object.ts"
force: true
---
import { BaseDocument } from '../../../document/object';
<% if (actions.find(a => a.hasAttachment)) {%>import { AttachmentInput } from '../../../document';<%}%>

import {
<% actions.filter(action => action.hasInput).forEach(action => { _%>
    <%= action.name %>Input,
<% }); _%>
} from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';

import {
<% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action.name) %>,
<% }); _%>
} from './creators';

import { <%= h.changeCase.pascal(documentType) %>Action } from '../actions';
import { <%= h.changeCase.pascal(documentType) %>State } from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';

export default class <%= h.changeCase.pascal(documentType) %>_<%= h.changeCase.pascal(module) %> extends BaseDocument<
    <%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action
> {
<% actions.filter(action => action.hasInput).forEach(action => { _%>
    public <%= h.changeCase.camel(action.name) %>(input: <%= action.name %>Input<%if(action.hasAttachment){ %>, attachments: AttachmentInput[] <% } %>) {
        return this.dispatch(<%= h.changeCase.camel(action.name) %>(input<%if(action.hasAttachment){ %>, attachments<% } %>));
    }
    
<% }); _%>
<% actions.filter(action => !action.hasInput).forEach(action => { _%>
    public <%= h.changeCase.camel(action.name) %>() {
        return this.dispatch(<%= h.changeCase.camel(action.name) %>());
    }
    
<% }); _%>
}