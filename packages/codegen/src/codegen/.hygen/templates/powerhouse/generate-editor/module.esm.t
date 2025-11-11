---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/module.ts"
force: true
---
import type { EditorModule } from "document-model";
import { lazy } from "react";

/** Document editor module for the Todo List document type */
export const <%= pascalCaseEditorName %>: EditorModule = {
    Component: lazy(() => import("./editor.js")),
    documentTypes: [<% if(!documentTypes.length){ %>"*"<% } else { %><% documentTypes.forEach(type => { _%>"<%= type %>", %><% }); _%> <% } %>],
    config: {
        id: "<%= editorId || paramCaseEditorName %>",
        name: "<%= name || pascalCaseEditorName %>",
    },
};