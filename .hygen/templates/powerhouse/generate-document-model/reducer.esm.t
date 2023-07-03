---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/reducer.ts"
force: true
---
import { isBaseAction } from "../../document/actions/types";
import { createReducer } from "../../document/utils";
import { Document, ImmutableReducer } from "../../document/types";
import { WritableDraft } from "immer/dist/internal";

import { <%= h.changeCase.pascal(documentType) %>State } from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';
import { <%= h.changeCase.pascal(documentType) %>Action } from './actions';

type Immutable<%= h.changeCase.pascal(documentType) %>State = WritableDraft<Document<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action>>;

const stateReducer: ImmutableReducer<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action> =
    (state: Immutable<%= h.changeCase.pascal(documentType) %>State, action: <%= h.changeCase.pascal(documentType) %>Action) => {
        if (isBaseAction(action)) {
            return state;
        }

        switch (action.type) {
<%-
    modules.map(m => m.operations.map(o => '            case "' + h.changeCase.constant(o.name) + '":').join('\n')).join('\n')
%>
            default:
                return state;
        }
    }

export const reducer = createReducer<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action>(stateReducer);
