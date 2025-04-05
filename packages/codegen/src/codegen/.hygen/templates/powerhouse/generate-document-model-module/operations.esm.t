---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/operations.ts"
force: true
---
import { type SignalDispatch } from 'document-model';
import {
<% actions.forEach(action => { _%>
    <%= 'type ' + h.changeCase.pascal(action.name) %>Action,
<% }); _%>
} from './actions.js';
import { <%= actions.map(action => 'type ' + h.changeCase.pascal(h.changeCase.pascal(documentType + '_' + action.state + '_State'))).filter((value, index, self) => self.indexOf(value) === index).join(', ') %> } from '../types.js';

export interface <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Operations {
<% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action.name) %>Operation: (state: <%= h.changeCase.pascal(documentType + '_' + action.state + '_State') %>, action: <%= h.changeCase.pascal(action.name) %>Action, dispatch?: SignalDispatch) => void,
<% }); _%>
}