---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/actions.ts"
force: true
---
import { Action } from '../../../document';

import {
<% actions.filter(a => a.hasInput).forEach(action => { _%>
    <%= action.name %>Input,
<% }); _%>
} from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';

<% actions.filter(a => a.hasInput).forEach(actionType => { _%>
export type <%= actionType.name %>Action = Action<'<%= h.changeCase.constantCase(actionType.name) %>', <%= actionType.name %>Input>;
<% }); _%>
<% actions.filter(a => !a.hasInput).forEach(actionType => { _%>
export type <%= actionType.name %>Action = Action<'<%= h.changeCase.constantCase(actionType.name) %>', never>;
<% }); _%>

export type <%= documentType %><%= h.changeCase.pascal(module) %>Action = 
<% actions.forEach(actionType => { _%>
    | <%= actionType.name %>Action
<% }); _%>;