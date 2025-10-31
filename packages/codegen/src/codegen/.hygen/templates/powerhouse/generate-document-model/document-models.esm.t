---
force: true
to: "<%= rootDir %>/document-models.ts"
---
<% moduleExports.forEach(me => { _%>
import { <%= me.pascalCaseName %> } from './<%= me.paramCaseName %>/module.js';
<% }); _%>

export const documentModels = [
  <% moduleExports.forEach(me => { _%>
<%= me.pascalCaseName %>,
<% }); _%>
]