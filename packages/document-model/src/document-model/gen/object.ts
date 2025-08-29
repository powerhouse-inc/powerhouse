import type { AbstractConstructor, BaseDocumentClass } from "document-model";
import { DocumentModelCore } from "./document-model-core.js";
import { DocumentModel_State } from "./state/object.js";
import { DocumentModel_Operation } from "./operation/object.js";
import { DocumentModel_OperationExample } from "./operation-example/object.js";
import { DocumentModel_OperationError } from "./operation-error/object.js";
import { DocumentModel_Module } from "./module/object.js";
import { DocumentModel_Versioning } from "./versioning/object.js";
import { DocumentModel_Header } from "./header/object.js";

// widen the base constructor so inference doesn’t fight the specialized generics
type AnyDocCtor = AbstractConstructor<BaseDocumentClass<any, any, any>>;
const BaseAny = DocumentModelCore as unknown as AnyDocCtor;

const DocumentModelMixed = DocumentModel_State(
  DocumentModel_Operation(
    DocumentModel_OperationExample(
      DocumentModel_OperationError(
        DocumentModel_Module(
          DocumentModel_Versioning(DocumentModel_Header(BaseAny)),
        ),
      ),
    ),
  ),
);

export class DocumentModelClass extends DocumentModelMixed {}
