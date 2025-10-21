---
to: "<%= rootDir %>/index.ts"
prepend: true
skip_if: 'export { processorFactory } from "./factory.js"'
inject: true
---
/**
 * Processor exports
 * This file is auto-generated and updated by codegen
 */

export { processorFactory } from "./factory.js";