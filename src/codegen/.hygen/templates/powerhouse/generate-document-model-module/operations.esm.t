---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/operations.ts"
force: true
---
import { Signal } from 'document-model/document';
import {
<% actions.forEach(action => { _%>
    <%= h.changeCase.pascal(action.name) %>Action,
<% }); _%>
} from './actions';
import { <%= h.changeCase.pascal(documentType) %>State } from '../types';

export type SignalDispatch = (signal: Signal) => void;

export interface <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Operations {
<% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action.name) %>Operation: (state: <%= h.changeCase.pascal(documentType) %>State, action: <%= h.changeCase.pascal(action.name) %>Action, dispatch?: SignalDispatch) => void,
<% }); _%>
}