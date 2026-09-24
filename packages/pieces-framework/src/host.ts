// What a host that *runs* pieces needs and a piece author never imports: coercion
// of stored prop values, the SSRF address classifier, and the error formatter.
export {
  formatPieceError,
  tryParseFriendlyPieceError,
} from "../upstream/core-utils/lib/friendly-piece-error.js";
export type { FriendlyPieceError } from "../upstream/core-utils/lib/friendly-piece-error.js";
export { ssrfIpClassifier } from "../upstream/core-utils/lib/ssrf-ip-classifier.js";
export { dynamicPropKeys } from "../upstream/engine/lib/helper/dynamic-prop-keys.js";
export { arrayZipperProcessor } from "../upstream/engine/lib/variables/processors/array-zipper.js";
export { checkboxProcessor } from "../upstream/engine/lib/variables/processors/checkbox.js";
export { dateTimeProcessor } from "../upstream/engine/lib/variables/processors/date-time.js";
export { fileProcessor } from "../upstream/engine/lib/variables/processors/file.js";
export { processors } from "../upstream/engine/lib/variables/processors/index.js";
export { jsonProcessor } from "../upstream/engine/lib/variables/processors/json.js";
export { multiSelectProcessor } from "../upstream/engine/lib/variables/processors/multi-select.js";
export { numberProcessor } from "../upstream/engine/lib/variables/processors/number.js";
export { objectProcessor } from "../upstream/engine/lib/variables/processors/object.js";
export { textProcessor } from "../upstream/engine/lib/variables/processors/text.js";
export type { ProcessorFn } from "../upstream/engine/lib/variables/processors/types.js";
export {
  propsProcessor,
  validateProperty,
} from "../upstream/engine/lib/variables/props-processor.js";
export type { PropertySettings } from "./host/shared-shim.js";
