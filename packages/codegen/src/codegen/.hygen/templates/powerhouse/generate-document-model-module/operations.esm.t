---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/operations.ts"
force: true
---
import { SignalDispatch } from 'document-model';
import {
<% actions.forEach(action => { _%>
    <%= h.changeCase.pascal(action.name) %>Action,
<% }); _%>
} from './actions';
import { <%= actions.map(action => h.changeCase.pascal(h.changeCase.pascal(documentType + '_' + action.state + '_State'))).filter((value, index, self) => self.indexOf(value) === index).join(', ') %> } from '../types';

export interface <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Operations {
<% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action.name) %>Operation: (state: <%= h.changeCase.pascal(documentType + '_' + action.state + '_State') %>, action: <%= h.changeCase.pascal(action.name) %>Action, dispatch?: SignalDispatch) => void,
<% }); _%>
}