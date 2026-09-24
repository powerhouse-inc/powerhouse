// Minimal stand-ins for the @activepieces/shared symbols the vendored engine files
// need; upstream declares them in packages/shared, which we deliberately do not vendor.
import type { InputPropertyMap } from "../../upstream/framework/index.js";

// activepieces packages/core/execution: how a DYNAMIC property's schema was set.
export const PropertyExecutionType = {
  MANUAL: "MANUAL",
  DYNAMIC: "DYNAMIC",
} as const;
export type PropertyExecutionType =
  (typeof PropertyExecutionType)[keyof typeof PropertyExecutionType];

// activepieces packages/shared: the stored schema of a DYNAMIC property, which
// props-processor re-runs its child props through.
export type PropertySettings = {
  type?: PropertyExecutionType;
  schema: InputPropertyMap;
};
