---
to: "./src/<%= h.changeCase.param(documentType) %>/custom/<%= module %>/reducer.ts"
unless_exists: true
---
/**
* This is a scaffold file meant for customization: 
* - modify it by implementing the reducer functions
* - delete the file and run the code generator again to have it reset
*/

import { <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Operations } from '../../gen/<%= module %>/operations';

export const reducer: <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module) %>Operations = {
<% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action) %>Operation(state, action) {
        throw new Error('Reducer "<%= h.changeCase.camel(action) %>Operation" not yet implemented');
    },
<% }); _%>
}