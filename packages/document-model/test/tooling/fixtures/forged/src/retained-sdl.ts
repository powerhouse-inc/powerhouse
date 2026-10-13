import { buildRetainedMismatch } from "./base.js";

/**
 * A retained stored schema that describes a different structure than the
 * declaration. Only tooling parses it, so this is the one class of defect that
 * a cold import cannot catch and publication must not carry.
 */
export const retained = buildRetainedMismatch();
