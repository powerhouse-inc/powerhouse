---
inject: true
to: "<%= rootDir %>/index.ts"
before: "\nexport const modules = \\["
skip_if: "import { module as <%= documentType %> }"
---
import { module as <%= documentType %> } from './<%= h.changeCase.param(documentType)  %>';