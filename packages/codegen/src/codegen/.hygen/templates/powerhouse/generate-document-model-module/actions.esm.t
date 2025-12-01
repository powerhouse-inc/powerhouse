---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/actions.ts"
force: true
---
import { type Action<% if (actions.find(a => a.hasAttachment)) {%>, ActionWithAttachment<%}%> } from 'document-model';
import type {
<% actions.filter(a => a.hasInput).forEach(action => { _%>
    <%= h.changeCase.pascal(action.name) %>Input,
<% }); _%>
} from '../types.js';

<% actions.filter(a => a.hasInput).forEach(actionType => { _%>
export <%= 'type ' + h.changeCase.pascal(actionType.name) %>Action = <%if(actionType.hasAttachment){ %>ActionWithAttachment<% } else { %>Action<% } %> & { type: '<%= h.changeCase.constantCase(actionType.name) %>'; input: <%= h.changeCase.pascal(actionType.name) %>Input };
<% }); _%>
<% actions.filter(a => !a.hasInput).forEach(actionType => { _%>
export <%= 'type ' + h.changeCase.pascal(actionType.name) %>Action = Action & { type: '<%= h.changeCase.constantCase(actionType.name) %>'; input: {} };
<% }); _%>

export <%= 'type ' + h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Action = 
<% actions.forEach(actionType => { _%>
    | <%= h.changeCase.pascal(actionType.name) %>Action
<% }); _%>;