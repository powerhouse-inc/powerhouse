---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/actions.ts"
force: true
---
import { type BaseAction<% if (actions.find(a => a.hasAttachment)) {%>, BaseActionWithAttachment<%}%> } from 'document-model';
import type {
<% actions.filter(a => a.hasInput).forEach(action => { _%>
    <%= h.changeCase.pascal(action.name) %>Input,
<% }); _%>
} from '../types.js';

<% actions.filter(a => a.hasInput).forEach(actionType => { _%>
export <%= 'type ' + h.changeCase.pascal(actionType.name) %>Action = BaseAction<%if(actionType.hasAttachment){ %>WithAttachment<% } %><'<%= h.changeCase.constantCase(actionType.name) %>', <%= h.changeCase.pascal(actionType.name) %>Input>;
<% }); _%>
<% actions.filter(a => !a.hasInput).forEach(actionType => { _%>
export <%= 'type ' + h.changeCase.pascal(actionType.name) %>Action = BaseAction<'<%= h.changeCase.constantCase(actionType.name) %>', never>;
<% }); _%>

export <%= 'type ' + h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Action = 
<% actions.forEach(actionType => { _%>
    | <%= h.changeCase.pascal(actionType.name) %>Action
<% }); _%>;