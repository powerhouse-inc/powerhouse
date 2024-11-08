---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/<%= module %>/exceptions.ts"
force: true
---

<% actions.forEach(action => { _%>
<% action.errors.forEach(error => { _%>
class <%= h.changeCase.pascal(error.name) %> extends Error {
    errorCode = '<%= h.changeCase.pascal(error.name) %>';
    constructor(message = '<%= h.changeCase.pascal(error.name) %>') {
        super(message);
    }
}

<% }); _%>
<% }); _%>


export default {
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

