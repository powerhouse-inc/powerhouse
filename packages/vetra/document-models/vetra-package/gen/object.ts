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
    initialState?: Partial<BaseStateFromDocument<VetraPackageDocument>>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, VetraPackage.fileExtension, name);
  }

  public loadFromFile(path: string) {
    return super.loadFromFile(path);
  }

  static async fromFile(path: string) {
    const document = new this();
    await document.loadFromFile(path);
    return document;
  }
}

applyMixins(VetraPackage, [VetraPackage_BaseOperations]);

export { VetraPackage };
