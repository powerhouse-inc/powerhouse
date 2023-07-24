---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/actions.ts"
force: true
---
import { ActionType } from '../../../document/utils';

import {
<% actions.forEach(action => { _%>
    <%= action %>Input,
<% }); _%>
} from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';

<% actions.forEach(actionType => { _%>
export type <%= actionType %>Action = ActionType<'<%= h.changeCase.constantCase(actionType) %>', <%= actionType %>Input>;
<% }); _%>

export type <%= documentType %><%= h.changeCase.pascal(module) %>Action = 
<% actions.forEach(actionType => { _%>
    | <%= actionType %>Action
<% }); _%>;