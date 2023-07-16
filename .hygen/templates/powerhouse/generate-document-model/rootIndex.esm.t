---
to: "./src/<%= h.changeCase.param(documentType) %>/index.ts"
unless_exists: true
---
/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

import { actions as BaseActions } from '../document';
import { reducer } from './gen/reducer';
import * as gen from './gen';
import { 
    createEmpty<%= h.changeCase.pascal(documentType) %>State, 
    createEmptyExtended<%= h.changeCase.pascal(documentType) %>State 
} from './custom/utils';

const { <%= h.changeCase.pascal(documentType) %>, ...<%= h.changeCase.pascal(documentType) %>Actions } = gen;
const actions = { ...BaseActions, ...<%= h.changeCase.pascal(documentType) %>Actions };

export {
    actions,
    reducer, 
    <%= h.changeCase.pascal(documentType) %>,
    createEmpty<%= h.changeCase.pascal(documentType) %>State,
    createEmptyExtended<%= h.changeCase.pascal(documentType) %>State
}