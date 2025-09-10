---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/object.ts"
force: true
---
import { BaseDocumentClass<% if (actions.find(a => a.hasAttachment)) {%>, AttachmentInput<%}%> } from 'document-model';
import { <%= h.changeCase.pascal(documentType) %>PHState } from '../ph-factories.js';
import {
<% actions.filter(action => action.hasInput).forEach(action => { _%>
    <%= 'type ' + h.changeCase.pascal(action.name) %>Input,
<% }); _%>
} from '../types.js';
import {
<% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action.name) %>,
<% }); _%>
} from './creators.js';
import { <%= 'type ' + h.changeCase.pascal(documentType) %>Action } from '../actions.js';

export default class <%= h.changeCase.pascal(documentType) %>_<%= h.changeCase.pascal(module) %> extends BaseDocumentClass<<%= h.changeCase.pascal(documentType) %>PHState> {
<% actions.filter(action => action.hasInput).forEach(action => { _%>
    public <%= h.changeCase.camel(action.name) %>(input: <%= h.changeCase.pascal(action.name) %>Input<%if(action.hasAttachment){ %>, attachments: AttachmentInput[] <% } %>) {
        return this.dispatch(<%= h.changeCase.camel(action.name) %>(input<%if(action.hasAttachment){ %>, attachments<% } %>));
    }
    
<% }); _%>
<% actions.filter(action => !action.hasInput).forEach(action => { _%>
    public <%= h.changeCase.camel(action.name) %>() {
        return this.dispatch(<%= h.changeCase.camel(action.name) %>());
    }
    
<% }); _%>
}