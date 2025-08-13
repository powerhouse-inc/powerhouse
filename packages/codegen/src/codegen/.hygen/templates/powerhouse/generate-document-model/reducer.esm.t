---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/reducer.ts"
force: true
---
// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { type StateReducer, isDocumentAction, createReducer } from "document-model";
import { <%= 'type ' + h.changeCase.pascal(documentType) %>Document, z } from './types.js';

<% modules.forEach(m => { _%>
import { reducer as <%= h.changeCase.pascal(m.name) %>Reducer } from '../src/reducers/<%= h.changeCase.param(m.name) %>.js';
<%_ }); %>

const stateReducer: StateReducer<<%= h.changeCase.pascal(documentType) %>Document> =
    (state, action, dispatch) => {
        if (isDocumentAction(action)) {
            return state;
        }

        switch (action.type) {
<%-
    modules.map(m => m.operations.map(o => 
        '            case "' + h.changeCase.constant(o.name) + '":\n' + 
        '                ' + (o.schema !== null ? 
            'z.' + h.changeCase.pascalCase(o.name) + 'InputSchema().parse(action.input);\n' : 
            'if (Object.keys(action.input).length > 0) throw new Error("Expected empty input for action ' + h.changeCase.constant(o.name) + '");\n') +
        '                ' + h.changeCase.pascal(m.name) + 'Reducer.' + h.changeCase.camel(o.name) + 'Operation((state as any)[action.scope], action as any, dispatch);\n' +
        '                break;\n'        
    ).join('\n')).join('\n')
%>
            default:
                return state;
        }
    }

export const reducer = createReducer<<%= h.changeCase.pascal(documentType) %>Document>(stateReducer);
