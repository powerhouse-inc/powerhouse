import v8 from "node:v8";

export const WASM_WRAPPER_TIERING_FLAG =
  "--wasm-wrapper-tiering-budget=1000000000";

let applied = false;

/** Node 24 V8 double-frees tiered wasm wrappers as instances die (#66366). */
export function disableWasmWrapperTiering(): boolean {
  // TODO(nodejs/node#66376): narrow to 24.x releases older than the backport.
  if (applied || process.versions.node.split(".")[0] !== "24") return false;
  v8.setFlagsFromString(WASM_WRAPPER_TIERING_FLAG);
  applied = true;
  return true;
}
