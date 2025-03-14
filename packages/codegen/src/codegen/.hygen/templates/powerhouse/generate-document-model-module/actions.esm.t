---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/actions.ts"
force: true
---
import { BaseAction<% if (actions.find(a => a.hasAttachment)) {%>, BaseActionWithAttachment<%}%> } from 'document-model';
import {
<% actions.filter(a => a.hasInput).forEach(action => { _%>
    <%= h.changeCase.pascal(action.name) %>Input,
<% }); _%>
} from '../types';

<% actions.filter(a => a.hasInput).forEach(actionType => { _%>
export type <%= h.changeCase.pascal(actionType.name) %>Action = BaseAction<%if(actionType.hasAttachment){ %>WithAttachment<% } %><'<%= h.changeCase.constantCase(actionType.name) %>', <%= h.changeCase.pascal(actionType.name) %>Input, '<%= actionType.scope %>'>;
<% }); _%>
<% actions.filter(a => !a.hasInput).forEach(actionType => { _%>
export type <%= h.changeCase.pascal(actionType.name) %>Action = BaseAction<'<%= h.changeCase.constantCase(actionType.name) %>', never, '<%= actionType.scope %>'>;
<% }); _%>

export type <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Action = 
<% actions.forEach(actionType => { _%>
    | <%= h.changeCase.pascal(actionType.name) %>Action
<% }); _%>;