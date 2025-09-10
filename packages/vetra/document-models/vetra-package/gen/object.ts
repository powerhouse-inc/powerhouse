import type { BaseStateFromDocument, SignalDispatch } from "document-model";
import { applyMixins, BaseDocumentClass } from "document-model";
import type { VetraPackageAction } from "./actions.js";
import VetraPackage_BaseOperations from "./base-operations/object.js";
import { reducer } from "./reducer.js";
import type {
  VetraPackageDocument,
  VetraPackageLocalState,
  VetraPackageState,
} from "./types.js";
import utils from "./utils.js";

export * from "./base-operations/object.js";

interface VetraPackage extends VetraPackage_BaseOperations {}

class VetraPackage extends BaseDocumentClass<
  VetraPackageState,
  VetraPackageLocalState,
  VetraPackageAction
> {
  static fileExtension = ".phdm";

  constructor(
    initialState?: Partial<VetraPackagePHState>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, createDocument(initialState), dispatch);
  }
}

applyMixins(VetraPackage, [VetraPackage_BaseOperations]);

export { VetraPackage };
