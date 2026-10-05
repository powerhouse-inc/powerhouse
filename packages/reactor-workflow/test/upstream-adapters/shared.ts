// The @activepieces/shared symbols the conformance tests import, as our own
// constants and errors. First import: the egress guard must load after the seams.
import "./net-seams.js";
import type { InputPropertyMap } from "@powerhousedao/pieces-framework";
import { EgressDeniedError } from "../../src/pieces/activepieces/worker/egress.js";
import {
  PIECE_STORE_MAX_KEY_LENGTH,
  PIECE_STORE_MAX_VALUE_BYTES,
} from "../../src/reactor/store.js";

export { AppConnectionType } from "@powerhousedao/pieces-framework";

export const STORE_KEY_MAX_LENGTH = PIECE_STORE_MAX_KEY_LENGTH;
export const STORE_VALUE_MAX_SIZE = PIECE_STORE_MAX_VALUE_BYTES;

export const SSRFBlockedError = EgressDeniedError;

// Upstream's connection status; connection-resolver.ts maps it onto ours.
export const AppConnectionStatus = {
  ACTIVE: "ACTIVE",
  MISSING: "MISSING",
  ERROR: "ERROR",
} as const;
export type AppConnectionStatus =
  (typeof AppConnectionStatus)[keyof typeof AppConnectionStatus];

export const PropertyExecutionType = {
  MANUAL: "MANUAL",
  DYNAMIC: "DYNAMIC",
} as const;
export type PropertyExecutionType =
  (typeof PropertyExecutionType)[keyof typeof PropertyExecutionType];

export interface PropertySettings {
  type: PropertyExecutionType;
  schema?: InputPropertyMap;
}
