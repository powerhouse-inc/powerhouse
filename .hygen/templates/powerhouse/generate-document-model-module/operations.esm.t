---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/operations.ts"
force: true
---
import {
<% actions.forEach(action => { _%>
    <%= action.name %>Action,
<% }); _%>
} from './actions';

import { <%= h.changeCase.pascal(documentType) %>State } from '../types';

export interface <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Operations {
<% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action.name) %>Operation: (state: <%= h.changeCase.pascal(documentType) %>State, action: <%= action.name %>Action) => void,
<% }); _%>
}