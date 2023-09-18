---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/schema/index.ts"
force: true
---
export * from "./types";
export * as z from "./zod";