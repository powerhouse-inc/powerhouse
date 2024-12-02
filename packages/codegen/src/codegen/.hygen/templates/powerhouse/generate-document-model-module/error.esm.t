---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/error.ts"
force: true
---
<% if (actions.some(action => action.errors?.length > 0)) { _%>
export type ErrorCode =
<% actions.forEach((action, actionIndex) => { _%>
<% action.errors.forEach((error, errorIndex) => { _%>
    | '<%= h.changeCase.pascal(error.name) %>'<% if (actionIndex === actions.length - 1 && errorIndex === action.errors.length - 1) { %>;<% } %>
<% }); _%>
<% }); _%>

export interface ReducerError {
    errorCode: ErrorCode;
}

<% actions.forEach(action => { _%>
<% action.errors.forEach(error => { _%>
export class <%= h.changeCase.pascal(error.name) %> extends Error implements ReducerError {
    errorCode = '<%= h.changeCase.pascal(error.name) %>' as ErrorCode;
    constructor(message = '<%= h.changeCase.pascal(error.name) %>') {
        super(message);
    }
}

<% }); _%>
<% }); _%>

<% } _%>
export const errors = {
<% actions.forEach(action => { _%>
<% if(action.errors?.length > 0){ -%>
    <%= h.changeCase.pascal(action.name) %>: {
    <% action.errors.forEach(error => { _%>
    <%= h.changeCase.pascal(error.name) %>,
    <% }); _%>
},
<% } -%>
<% }); _%>
};
