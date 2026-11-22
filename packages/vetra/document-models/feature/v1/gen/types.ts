/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { FeatureAction } from "./actions.js";
import type { FeatureState as FeatureGlobalState } from "./schema/types.js";

type FeatureLocalState = Record<PropertyKey, never>;

type FeaturePHState = PHBaseState & {
  global: FeatureGlobalState;
  local: FeatureLocalState;
};
type FeatureDocument = PHDocument<FeaturePHState>;

export * from "./schema/types.js";

export type {
  FeatureAction,
  FeatureDocument,
  FeatureGlobalState,
  FeatureLocalState,
  FeaturePHState,
};
