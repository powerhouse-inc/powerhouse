// Bootstrap for the entry integration test. Registers the tsx ESM hook
// so TypeScript files can be imported with .js extensions, then loads
// the worker entry module.
import { register } from "tsx/esm/api";

register();

await import(
  "../../../../src/executor/worker/entry.ts"
);
