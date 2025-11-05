---
force: true
to: "<%= rootDir %>/document-models.ts"
---
import type { DocumentModelModule } from "document-model";
<% moduleExports.forEach(me => { _%>
import { <%= me.pascalCaseName %> } from "./<%= me.paramCaseName %>/module.js";
<% }); _%>

export const documentModels: DocumentModelModule<any>[] = [
  <% moduleExports.forEach(me => { _%>
<%= me.pascalCaseName %>,
<% }); _%>
]