// @ts-check
// The connect host built into a scratch folder: runtime-config-preview.spec.ts
// builds it with --packages-registry and reads the config that build wrote.
import connect from "../connect/host.js";

export default /** @satisfies {PHHost} */ ({
  ...connect,
  runner: { ...connect.runner, outDir: "dist-connect-registry" },
});
