import type * as LzString from "lz-string";

/**
 * lz-string is a CommonJS package whose own typings only declare named
 * exports. Under plain Node ESM a namespace import (`import * as lz`)
 * therefore exposes no named exports at runtime — the functions sit on
 * `.default` (the CJS `module.exports`) — so code imports it as a default
 * export instead. This augmentation adds the matching default export to
 * the typings; default-import interop works identically in Node ESM,
 * vite, and vitest.
 */
declare module "lz-string" {
  const lzString: typeof LzString;
  export default lzString;
}
