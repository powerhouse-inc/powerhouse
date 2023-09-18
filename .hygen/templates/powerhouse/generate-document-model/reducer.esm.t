---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/reducer.ts"
force: true
---
import { isBaseAction } from "../../document/actions/types";
import { createReducer } from "../../document/utils";
import { ImmutableStateReducer } from "../../document/types";
import { <%= h.changeCase.pascal(documentType) %>State, z } from './schema';
import { <%= h.changeCase.pascal(documentType) %>Action } from './actions';

<% modules.forEach(m => { _%>
import { reducer as <%= h.changeCase.pascal(m.name) %>Reducer } from '../custom/reducers/<%= h.changeCase.param(m.name) %>';
<%_ }); %>

const stateReducer: ImmutableStateReducer<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action> =
    (state, action) => {
        if (isBaseAction(action)) {
            return state;
        }

        switch (action.type) {
<%-
    modules.map(m => m.operations.map(o => 
        '            case "' + h.changeCase.constant(o.name) + '":\n' + 
        '                ' + (o.schema !== null ? 
            'z.' + h.changeCase.pascalCase(o.name) + 'InputSchema().parse(action.input);\n' : 
            'if (Object.keys(action.input).length > 0) throw new Error("Expected empty input for action ' + h.changeCase.constant(o.name) + '");\n') +
        '                ' + h.changeCase.pascal(m.name) + 'Reducer.' + h.changeCase.camel(o.name) + 'Operation(state, action);\n' +
        '                break;\n'        
    ).join('\n')).join('\n')
%>
            default:
                return state;
        }
    }

export const reducer = createReducer<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action>(stateReducer);