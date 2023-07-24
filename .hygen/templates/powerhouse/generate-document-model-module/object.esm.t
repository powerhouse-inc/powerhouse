---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/object.ts"
force: true
---
import { BaseDocument } from '../../../document/object';

import {
<% actions.forEach(action => { _%>
    <%= action %>Input,
<% }); _%>
} from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';

import {
<% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action) %>,
<% }); _%>
} from './creators';

import { <%= h.changeCase.pascal(documentType) %>Action } from '../actions';
import { <%= h.changeCase.pascal(documentType) %>State } from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';

export default class <%= h.changeCase.pascal(documentType) %>_<%= h.changeCase.pascal(module) %> extends BaseDocument<
    <%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action
> {
<% actions.forEach(action => { _%>
    public <%= h.changeCase.camel(action) %>(input: <%= action %>Input) {
        return this.dispatch(<%= h.changeCase.camel(action) %>(input));
    }
    
<% }); _%>
}