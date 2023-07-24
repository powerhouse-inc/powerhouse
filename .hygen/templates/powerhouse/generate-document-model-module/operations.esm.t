---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/operations.ts"
force: true
---
import {
<% actions.forEach(action => { _%>
    <%= action %>Action,
<% }); _%>
} from './actions';

import { Extended<%= h.changeCase.pascal(documentType) %>State } from '../object';

export interface <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Operations {
<% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action) %>Operation: (state: Extended<%= h.changeCase.pascal(documentType) %>State, action: <%= action %>Action) => void,
<% }); _%>
}