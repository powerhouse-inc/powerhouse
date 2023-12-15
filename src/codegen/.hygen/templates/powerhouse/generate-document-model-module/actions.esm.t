---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/actions.ts"
force: true
---
import { Action<% if (actions.find(a => a.hasAttachment)) {%>, ActionWithAttachment<%}%> } from 'document-model/document';
import {
<% actions.filter(a => a.hasInput).forEach(action => { _%>
    <%= h.changeCase.pascal(action.name) %>Input,
<% }); _%>
} from '../types';

<% actions.filter(a => a.hasInput).forEach(actionType => { _%>
export type <%= h.changeCase.pascal(actionType.name) %>Action = Action<%if(actionType.hasAttachment){ %>WithAttachment<% } %><'<%= h.changeCase.constantCase(actionType.name) %>', <%= h.changeCase.pascal(actionType.name) %>Input, '<%= actionType.scope %>'>;
<% }); _%>
<% actions.filter(a => !a.hasInput).forEach(actionType => { _%>
export type <%= h.changeCase.pascal(actionType.name) %>Action = Action<'<%= h.changeCase.constantCase(actionType.name) %>', never, '<%= actionType.scope %>'>;
<% }); _%>

export type <%= documentType %><%= h.changeCase.pascal(module) %>Action = 
<% actions.forEach(actionType => { _%>
    | <%= h.changeCase.pascal(actionType.name) %>Action
<% }); _%>;