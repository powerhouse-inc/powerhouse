---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/index.ts"
force: true
---
export * from './actions';
export * from './document-model';
export * from './object';
export * from './types';
export * as actions from './creators';