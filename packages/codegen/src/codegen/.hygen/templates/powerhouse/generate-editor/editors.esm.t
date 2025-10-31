---
force: true
to: "<%= rootDir %>/editors.ts"
---
<% moduleExports.forEach(me => { _%>
import { <%= me.pascalCaseName %> } from './<%= me.paramCaseName %>/module.js';
<% }); _%>

export const editors = [
  <% moduleExports.forEach(me => { _%>
<%= me.pascalCaseName %>,
<% }); _%>
]