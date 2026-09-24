// Ends every emitted declaration chunk with `export {}`. Without an export
// list, TypeScript treats every top-level declaration in a .d.ts as exported.
const DTS = /\.d\.[cm]?ts$/;
const EXPORT_ASSIGNMENT = /^export\s*=/m;
// The source map comment must stay the last line.
const SOURCE_MAP_COMMENT = /\n\/\/# sourceMappingURL=[^\n]*\s*$/;

export function dtsExportList() {
  return {
    name: "powerhouse:dts-export-list",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !DTS.test(chunk.fileName)) continue;
        // `export =` cannot share a module with other exports.
        if (EXPORT_ASSIGNMENT.test(chunk.code)) continue;
        const tail = chunk.code.match(SOURCE_MAP_COMMENT)?.[0] ?? "";
        const body = chunk.code.slice(0, chunk.code.length - tail.length);
        chunk.code = `${body.trimEnd()}\nexport {};${tail || "\n"}`;
      }
    },
  };
}
