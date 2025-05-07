---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/index.ts"
force: true
---
export * from './actions.js';
export * from './document-model.js';
export * from './object.js';
export * from './types.js';
export * as actions from './creators.js';