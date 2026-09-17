// Minimal stand-ins for the @activepieces/shared symbols the vendored engine files
// need; upstream declares them in packages/shared, which we deliberately do not vendor.
import type { InputPropertyMap } from "../../upstream/framework/index.js";

// activepieces packages/shared: the stored schema of a DYNAMIC property, which
// props-processor re-runs its child props through.
export type PropertySettings = {
  schema: InputPropertyMap;
};
