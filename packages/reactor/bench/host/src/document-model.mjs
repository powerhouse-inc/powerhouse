// Worker-side document-model wrapper. The reactor's worker factory hard-codes
// `exportName: "documentModel"` on the spec, so we expose `driveDocumentModelModule`
// from @powerhousedao/shared/document-drive under that name. Plain .mjs so the
// worker's `await import(filePath)` works without a TS loader.
export { driveDocumentModelModule as documentModel } from "@powerhousedao/shared/document-drive";
