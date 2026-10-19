import {
  createAction,
  Property,
  type ReactorClient,
} from "@powerhousedao/pieces-framework";
import { documentReference } from "@powerhousedao/pieces-framework/workflow";
import type {
  Action,
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  DEFAULT_BRANCH,
  DRIVE_DOCUMENT_TYPES,
  plainAction,
  typedAction,
} from "../documents.js";
import { coerceInput } from "../input-props.js";
import {
  ConfigReader,
  parseActionInput,
  parseActions,
  parseCreatePayload,
} from "../parse.js";
import {
  ACTION_GROUP,
  actionInputProp,
  actionsProp,
  actionTypeProp,
  documentTypeProp,
  driveProp,
  folderProp,
  moduleInputSchema,
  parseProp,
  type FolderTarget,
} from "../reactor.js";

const BLOCK = "document-create";

type Target =
  | { kind: "none" }
  | { kind: "drive"; driveId: string; folderId?: string }
  | { kind: "parent"; parentId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The folder prop's value, as an object or the JSON text of one; a bare
// string is a folder id in the drive the parent prop names.
function folderTarget(
  value: unknown,
  reader: ConfigReader,
): FolderTarget | string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed =
    typeof value === "string" && value.trim().startsWith("{")
      ? reader.json(value, "folderId")
      : value;
  if (typeof parsed === "string") return parsed.trim() || undefined;
  if (
    isRecord(parsed) &&
    typeof parsed.driveId === "string" &&
    typeof parsed.folderId === "string"
  ) {
    return { driveId: parsed.driveId, folderId: parsed.folderId };
  }
  throw new Error(
    `${BLOCK}: "folderId" must be a folder from the list, or a folder id with "parentId" set to its drive`,
  );
}

async function resolveTarget(
  reactor: ReactorClient,
  parentId: string | undefined,
  folder: FolderTarget | string | undefined,
): Promise<Target> {
  if (folder && typeof folder === "object") {
    return { kind: "drive", ...folder };
  }
  if (!parentId) {
    if (folder) {
      throw new Error(`${BLOCK}: a folder id needs "parentId", its drive`);
    }
    return { kind: "none" };
  }
  const parent = await reactor.get(parentId);
  if (DRIVE_DOCUMENT_TYPES.has(parent.header.documentType)) {
    return { kind: "drive", driveId: parent.header.id, folderId: folder };
  }
  if (folder) {
    throw new Error(`${BLOCK}: "parentId" names a document, not a drive`);
  }
  return { kind: "parent", parentId: parent.header.id };
}

async function createIn(
  reactor: ReactorClient,
  module: DocumentModelModule,
  target: Target,
  name: string | undefined,
): Promise<PHDocument> {
  const documentType = module.documentModel.global.id;
  if (target.kind !== "drive" && !name) {
    return reactor.createEmpty(
      documentType,
      target.kind === "parent" ? { parentIdentifier: target.parentId } : {},
    );
  }
  const document = module.utils.createDocument() as PHDocument;
  // A drive node takes its name from the header.
  if (name) document.header.name = name;
  if (target.kind === "drive") {
    // A drive file is a child document plus the drive's node for it.
    const created = await reactor.create(document, target.driveId);
    await reactor.execute(target.driveId, DEFAULT_BRANCH, [
      plainAction("ADD_FILE", {
        id: created.header.id,
        name: created.header.name || created.header.id,
        documentType,
        parentFolder: target.folderId,
      }),
    ]);
    return created;
  }
  return reactor.create(
    document,
    target.kind === "parent" ? target.parentId : undefined,
  );
}

export const documentCreateAction = createAction({
  name: BLOCK,
  displayName: "Create document",
  description:
    "Creates a Powerhouse document. Outputs a reference to it: id, type, branch and revision.",
  requireAuth: false,
  requireReactor: "write",
  propertyGroups: [ACTION_GROUP("Optional, sent right after the create.")],
  props: {
    documentType: documentTypeProp(),
    name: Property.ShortText({ displayName: "Document name", required: false }),
    parentId: driveProp(
      "Parent drive",
      "A drive, or a document to create the new one under",
    ),
    folderId: folderProp("Folder", "parentId", "Omit for the drive's root"),
    actionType: actionTypeProp("Type", false),
    input: actionInputProp("Input"),
    actions: actionsProp(
      "Action list (JSON)",
      'Several actions after the create, or a payload from an earlier step: [{ "type": …, "input": … }]',
    ),
    payload: Property.ShortText({
      displayName: "Payload",
      description:
        "JSON {documentType, name, actions?}, e.g. {{steps.draft.output}}",
      required: false,
      advanced: true,
    }),
    parse: parseProp(),
  },
  run: async (ctx) => {
    const reactor = ctx.reactor;
    const config = ctx.propsValue;
    const reader = ConfigReader.of(BLOCK, config.parse);
    // A payload (typically model output) can name the type and the document.
    const payload = parseCreatePayload(config.payload, reader);
    const documentType =
      (typeof config.documentType === "string" && config.documentType) ||
      payload.documentType;
    if (!documentType) {
      throw new Error(
        `${BLOCK}: "documentType" is required, in the config or the payload`,
      );
    }
    const name =
      (typeof config.name === "string" && config.name) || payload.name;
    const parentId = reader.documentId(config.parentId, "parentId");
    const target = await resolveTarget(
      reactor,
      parentId,
      folderTarget(config.folderId, reader),
    );
    const module = await reactor.getDocumentModelModule(documentType);

    // Parsed before the create, so a bad list fails without a stray document.
    const followUps: Action[] = (
      config.actions !== undefined
        ? parseActions(config.actions, reader)
        : parseActions(payload.actions, reader, "payload.actions")
    ).map((entry) => plainAction(entry.type, entry.input, entry.scope));
    const actionType =
      typeof config.actionType === "string" ? config.actionType.trim() : "";
    if (actionType) {
      const schema = moduleInputSchema(module, actionType);
      const input = parseActionInput(config.input, reader);
      followUps.unshift(
        typedAction(
          module,
          actionType,
          schema ? coerceInput(schema, input) : input,
        ),
      );
    }

    const created = await createIn(reactor, module, target, name);
    const document = followUps.length
      ? await reactor.execute(created.header.id, DEFAULT_BRANCH, followUps)
      : created;
    return { ...documentReference(document.header), ...reader.output() };
  },
});
