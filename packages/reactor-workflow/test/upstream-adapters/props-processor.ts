// Upstream's propsProcessor over our coercion and validation (context/normalize.ts),
// what a step's props go through in the worker before run().
import type { PieceAuthProperty } from "@powerhousedao/pieces-framework";
import {
  normalizePropsValue,
  validatePropsValue,
} from "../../src/pieces/activepieces/context/normalize.js";
import type { ApProperty } from "../../src/pieces/activepieces/types.js";
import type { PropertySettings } from "./shared.js";

// Upstream's tests index the processed input freely.
type Processed = Record<string, any>;

export const propsProcessor = {
  // preparePropsValue minus the defaults, which upstream's builder applies
  // before this point. Auth and DYNAMIC settings have no counterpart here.
  async applyProcessorsAndValidators(
    resolvedInput: Record<string, unknown>,
    props: Record<string, unknown>,
    _auth: PieceAuthProperty | PieceAuthProperty[] | undefined,
    _requireAuth: boolean,
    _propertySettings: Record<string, PropertySettings>,
  ): Promise<{ processedInput: Processed; errors: Record<string, unknown> }> {
    const declared = props as Record<string, ApProperty>;
    const processedInput = await normalizePropsValue(declared, resolvedInput);
    const errors = validatePropsValue(declared, processedInput, resolvedInput);
    return { processedInput, errors };
  },
};
