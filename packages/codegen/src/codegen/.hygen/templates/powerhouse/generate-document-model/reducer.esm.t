---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/gen/reducer.ts"
force: true
---
// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { <%= phStateName %> } from "<%= documentModelDir %>";

<% modules.forEach(module => { _%>
import { <%= camelCaseDocumentType %><%= h.changeCase.pascal(module.name) %>Operations } from "../src/reducers/<%= h.changeCase.param(module.name) %>.js";
<%_ }); %>

<% const schemas = modules.flatMap(m =>
     m.operations.map(o => `${h.changeCase.pascalCase(o.name)}InputSchema`)
   );
%>
import {
  <%= schemas.join(',\n  ') %>
} from "./schema/zod.js";

const stateReducer: StateReducer<<%= phStateName %>> =
    (state, action, dispatch) => {
        if (isDocumentAction(action)) {
            return state;
        }

        switch (action.type) {
<%-
    modules.map(m => m.operations.map(o => 
        '            case "' + h.changeCase.constant(o.name) + '":\n' + 
        '                ' + (o.schema !== null ? 
            h.changeCase.pascalCase(o.name) + 'InputSchema().parse(action.input);\n' : 
            'if (Object.keys(action.input).length > 0) throw new Error("Expected empty input for action ' + h.changeCase.constant(o.name) + '");\n') +
        '                ' + camelCaseDocumentType + h.changeCase.pascal(m.name)  + 'Operations.' + h.changeCase.camel(o.name) + 'Operation((state as any)[action.scope], action as any, dispatch);\n' +
        '                break;\n'        
    ).join('\n')).join('\n')
%>
            default:
                return state;
        }
    }

export const reducer = createReducer<<%= phStateName %>>(stateReducer);
