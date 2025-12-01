---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/error.ts"
force: true
---
<% if (errors.length > 0) { _%>
export type ErrorCode =
<% errors.forEach((error, errorIndex) => { _%>
    | '<%= h.changeCase.pascal(error.name) %>'<% if (errorIndex === errors.length - 1) { %>;<% } %>
<% }); _%>

export interface ReducerError {
    errorCode: ErrorCode;
}

<% errors.forEach(error => { _%>
export class <%= h.changeCase.pascal(error.name) %> extends Error implements ReducerError {
    errorCode = '<%= h.changeCase.pascal(error.name) %>' as ErrorCode;
    constructor(message = '<%= h.changeCase.pascal(error.name) %>') {
        super(message);
    }
}

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
