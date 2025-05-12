---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/schema/index.ts"
force: true
---
export * from "./types.js";
export * as z from "./zod.js";