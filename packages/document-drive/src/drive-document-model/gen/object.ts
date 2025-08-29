import type { AugmentConstructor } from "document-model";
import { DocumentDriveCore } from "./document-drive-core.js";
import {
  DocumentDrive_Drive,
  type DocumentDrive_Drive_Augment,
} from "./drive/object.js";
import {
  DocumentDrive_Node,
  type DocumentDrive_Node_Augment,
} from "./node/object.js";
import type { DocumentDriveAction } from "./types.js";

type AnyCtor = abstract new (...a: any[]) => any;
const BaseAny = DocumentDriveCore as unknown as AnyCtor;

const Mixed: AugmentConstructor<
  AugmentConstructor<AnyCtor, DocumentDrive_Drive_Augment<DocumentDriveAction>>,
  DocumentDrive_Node_Augment<DocumentDriveAction>
> = DocumentDrive_Node(DocumentDrive_Drive(BaseAny));

export class DocumentDrive extends Mixed {}
