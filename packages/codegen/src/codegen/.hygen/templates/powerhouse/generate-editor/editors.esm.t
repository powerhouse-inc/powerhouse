---
force: true
to: "<%= rootDir %>/editors.ts"
---
import type { EditorModule } from "document-model";
<% moduleExports.forEach(me => { _%>
import { <%= me.pascalCaseName %> } from "./<%= me.paramCaseName %>/module.js";
<% }); _%>

export const editors: EditorModule[] = [
  <% moduleExports.forEach(me => { _%>
<%= me.pascalCaseName %>,
<% }); _%>
]