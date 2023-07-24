---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/creators.ts"
force: true
---
import { createAction } from '../../../document/utils'; 

import {
<% actions.forEach(action => { _%>
    <%= action %>Input,
<% }); _%>
} from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';

import {
<% actions.forEach(action => { _%>
    <%= action %>Action,
<% }); _%>
} from './actions';

<% actions.forEach(action => { _%>
export const <%= h.changeCase.camel(action) %> = (input: <%= action %>Input) =>
    createAction<<%= action %>Action>(
        '<%= h.changeCase.constantCase(action) %>',
        {...input}
    );

<% }); _%>