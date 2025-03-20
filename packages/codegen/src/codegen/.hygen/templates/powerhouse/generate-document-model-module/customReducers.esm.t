---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/src/reducers/<%= module %>.ts"
unless_exists: true
---
/**
* This is a scaffold file meant for customization: 
* - modify it by implementing the reducer functions
* - delete the file and run the code generator again to have it reset
*/

import { <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Operations } from '../../gen/<%= module %>/operations.js';

export const reducer: <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Operations = {
<% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action.name) %>Operation(state, action, dispatch) {
        // TODO: Implement "<%= h.changeCase.camel(action.name) %>Operation" reducer
        throw new Error('Reducer "<%= h.changeCase.camel(action.name) %>Operation" not yet implemented');
    },
<% }); _%>
}