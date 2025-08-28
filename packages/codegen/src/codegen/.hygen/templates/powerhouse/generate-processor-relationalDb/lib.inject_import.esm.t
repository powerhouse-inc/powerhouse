---
inject: true
to: "<%= rootDir %>/factory.ts"
after: "// Import processor factories here as they are generated"
skip_if: "{ <%= h.changeCase.camel(name) %>ProcessorFactory }"
---
import { <%= h.changeCase.camel(name) %>ProcessorFactory } from "./<%= h.changeCase.param(name) %>/factory.js";