---
inject: true
to: "<%= rootDir %>/factory.ts"
after: "// Import processor factories here as they are generated"
skip_if: "{ <%= h.changeCase.pascal(name) %>ProcessorFactory }"
---
import { <%= h.changeCase.pascal(name) %>ProcessorFactory } from "./<%= h.changeCase.param(name) %>/factory.js";