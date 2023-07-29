---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/creators.ts"
force: true
---
import { createAction } from '../../../document/utils'; 

import {
<% actions.filter(a => a.hasInput).forEach(action => { _%>
    <%= action.name %>Input,
<% }); _%>
} from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';

import {
<% actions.forEach(action => { _%>
    <%= action.name %>Action,
<% }); _%>
} from './actions';

<% actions.filter(a => a.hasInput).forEach(action => { _%>
export const <%= h.changeCase.camel(action.name) %> = (input: <%= action.name %>Input) =>
    createAction<<%= action.name %>Action>(
        '<%= h.changeCase.constantCase(action.name) %>',
        {...input}
    );

<% }); _%>

<% actions.filter(a => !a.hasInput).forEach(action => { _%>
export const <%= h.changeCase.camel(action.name) %> = () =>
    createAction<<%= action.name %>Action>('<%= h.changeCase.constantCase(action.name) %>', {});
<% }); _%>