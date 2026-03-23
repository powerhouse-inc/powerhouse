import type { DocumentModelUtils } from "@powerhousedao/shared/document-model";
import type { VetraPackagePHState } from "./gen/types.js";
import { utils as genUtils } from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

/** Utils for the VetraPackage document model */
export const utils: DocumentModelUtils<VetraPackagePHState> = {
  ...genUtils,
  ...customUtils,
};
