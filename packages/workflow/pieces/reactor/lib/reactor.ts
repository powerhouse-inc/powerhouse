// The props whose choices come from the reactor, and the reads they share
// with the actions. Resolvers get the host's design-time read client.
import {
  Property,
  ReactorAccessDeniedError,
  type PropertyContext,
  type ReactorReadClient,
} from "@powerhousedao/pieces-framework";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  describeModel,
  displayName as documentName,
  DRIVE_DOCUMENT_TYPE,
  SET_NAME_ACTION,
} from "./documents.js";
import { inputProps } from "./input-props.js";
import {
  parseActionInputSchema,
  type ActionInputSchema,
} from "./input-schema.js";
import { PARSE_MODES, staticString, type ParseMode } from "./parse.js";
import { folderOptions, withReferencedEnums } from "./schema-text.js";

// What one document dropdown lists of each type.
const OPTION_LIMIT = 100;

interface OptionEntry {
  label: string;
  value: string;
  // actionType only: the input's SDL and its model, for the editor's form.
  inputSchema?: string;
  documentType?: string;
}

interface OptionState {
  options: OptionEntry[];
  placeholder?: string;
}

// A folder in a drive: the step files into the drive, under the folder.
export interface FolderTarget {
  driveId: string;
  folderId: string;
}

// The read client the host serves a resolver of a declaring block.
function designTimeReactor(ctx: PropertyContext): ReactorReadClient {
  if (ctx.reactor) return ctx.reactor;
  const error = new Error("ctx.reactor is not served to this resolver");
  error.name = ReactorAccessDeniedError;
  throw error;
}

// Every installed module, across the client's pages.
export async function documentModelModules(
  reactor: ReactorReadClient,
): Promise<DocumentModelModule[]> {
  let page = await reactor.getDocumentModelModules();
  const modules = [...page.results];
  while (page.next && page.results.length > 0) {
    page = await page.next();
    modules.push(...page.results);
  }
  return modules;
}

// The installed document types, sorted.
export async function documentTypes(
  reactor: ReactorReadClient,
): Promise<{ documentType: string; name: string }[]> {
  const seen = new Map<string, string>();
  for (const module of await documentModelModules(reactor)) {
    const model = module.documentModel.global;
    if (model.id && !seen.has(model.id)) seen.set(model.id, model.name);
  }
  return [...seen]
    .map(([documentType, name]) => ({ documentType, name }))
    .sort((a, b) => a.documentType.localeCompare(b.documentType));
}

async function documentOptions(
  reactor: ReactorReadClient,
  documentType: string | undefined,
): Promise<OptionState> {
  // The index needs a type, so an untyped list asks once per installed type.
  const types = documentType
    ? [documentType]
    : (await documentTypes(reactor)).map((entry) => entry.documentType);
  const pages = await Promise.all(
    types.map((type) =>
      reactor.find({ type }, undefined, { cursor: "", limit: OPTION_LIMIT }),
    ),
  );
  const documents = pages.flatMap((page) => page.results);
  const nameOf = (document: PHDocument) =>
    documentName(document) || document.header.slug || "(unnamed)";
  const seen = new Map<string, number>();
  for (const document of documents) {
    seen.set(nameOf(document), (seen.get(nameOf(document)) ?? 0) + 1);
  }
  return {
    options: documents.map((document) => {
      const name = nameOf(document);
      const { id, slug } = document.header;
      // Two documents of one name are told apart by slug, else a short id.
      const shown =
        (seen.get(name) ?? 0) > 1
          ? `${name} (${slug && slug !== name ? slug : id.slice(0, 8)})`
          : name;
      // The type is noise when every option shares it.
      return {
        label: documentType
          ? shown
          : `${shown} — ${document.header.documentType}`,
        value: id,
      };
    }),
    placeholder:
      documentType === DRIVE_DOCUMENT_TYPE
        ? "Choose a drive"
        : documentType
          ? `Documents of type ${documentType}`
          : "All documents on this reactor",
  };
}

// The installed document models. Free text stays possible in this editor,
// which is what an expression-fed step needs.
export const documentTypeProp = (
  displayName = "Document type",
  required = false,
  description?: string,
) =>
  Property.Dropdown<string>({
    auth: undefined,
    displayName,
    description,
    required,
    refreshers: [],
    options: async (_propsValue, ctx) => ({
      options: (await documentTypes(designTimeReactor(ctx))).map((model) => ({
        label: model.name
          ? `${model.name} (${model.documentType})`
          : model.documentType,
        value: model.documentType,
      })),
    }),
  });

export const documentIdProp = (
  displayName = "Document id",
  required = false,
  description?: string,
) =>
  Property.Dropdown<string>({
    auth: undefined,
    displayName,
    description,
    required,
    // Narrowed by the sibling type when one is set, which is why it refreshes.
    refreshers: ["documentType"],
    options: (propsValue, ctx) =>
      documentOptions(
        designTimeReactor(ctx),
        staticString(propsValue.documentType),
      ),
  });

export const driveProp = (displayName: string, description?: string) =>
  Property.Dropdown<string>({
    auth: undefined,
    displayName,
    description,
    required: false,
    refreshers: [],
    options: (_propsValue, ctx) =>
      documentOptions(designTimeReactor(ctx), DRIVE_DOCUMENT_TYPE),
  });

// A folder inside the drive the `driveProp` sibling names, labelled by path.
// Its value carries the drive too, so the step needs no lookup.
export const folderProp = (
  displayName: string,
  driveProp: string,
  description?: string,
) =>
  Property.Dropdown<FolderTarget>({
    auth: undefined,
    displayName,
    description,
    required: false,
    refreshers: [driveProp],
    options: async (propsValue, ctx) => {
      const driveId = staticString(propsValue[driveProp]);
      if (!driveId) {
        return {
          disabled: true,
          options: [],
          placeholder: "Pick a drive first",
        };
      }
      const drive = await designTimeReactor(ctx).get(driveId);
      const state = drive.state as { global?: unknown };
      const options = folderOptions(state.global).map((option) => ({
        label: option.label,
        value: { driveId: drive.header.id, folderId: option.value },
      }));
      const name = documentName(drive);
      return {
        options,
        placeholder: options.length
          ? `Folders in ${name || "this drive"}`
          : `${name || "This drive"} has no folders`,
      };
    },
  });

// JSON text of [{type, input, scope?}], so model output reaches the piece's
// parsing. `display: "code"` asks the editor for a monospace field.
export const actionsProp = (displayName: string, description?: string) => ({
  ...Property.LongText({
    displayName,
    required: false,
    description,
    advanced: true,
  }),
  display: "code",
});

// How ids and JSON are read: as given, or dug out of model output.
export const parseProp = () =>
  Property.StaticDropdown<ParseMode>({
    displayName: "Parse",
    description:
      "Exact takes ids and JSON as given. Extract reads them out of an AI step's prose, and reports what it read from in extractedFrom",
    required: false,
    defaultValue: "exact",
    advanced: true,
    options: { options: PARSE_MODES },
  });

// The module a step targets: by the named type, or the document's own.
export async function targetModule(
  reactor: ReactorReadClient,
  propsValue: Record<string, unknown>,
): Promise<DocumentModelModule | undefined> {
  const named = staticString(propsValue.documentType);
  if (named) return reactor.getDocumentModelModule(named);
  const documentId = staticString(propsValue.documentId);
  if (!documentId) return undefined;
  const document = await reactor.get(documentId);
  return reactor.getDocumentModelModuleForDocument(document);
}

// The target type's own actions, each carrying its input SDL, plus SET_NAME.
export const actionTypeProp = (
  displayName = "Action type",
  required = false,
  description?: string,
) =>
  Property.Dropdown<string>({
    auth: undefined,
    displayName,
    description,
    required,
    refreshers: ["documentType", "documentId"],
    options: async (propsValue, ctx) => {
      const module = await targetModule(
        designTimeReactor(ctx),
        propsValue as Record<string, unknown>,
      );
      if (!module) {
        return {
          disabled: true,
          options: [
            {
              label: "SET_NAME (base)",
              value: SET_NAME_ACTION.type,
              inputSchema: SET_NAME_ACTION.inputSchema ?? undefined,
            },
          ],
          placeholder: "Pick a document type first",
        };
      }
      const model = describeModel(module);
      return {
        options: model.actions.map((action) => ({
          label: `${action.type} (${action.module})`,
          value: action.type,
          documentType: model.documentType,
          ...(action.inputSchema
            ? {
                inputSchema: withReferencedEnums(
                  action.inputSchema,
                  model.stateSchema,
                ),
              }
            : {}),
        })),
        placeholder: `Actions of ${model.documentType}`,
      };
    },
  });

// The action's input schema, with the enums it uses; undefined when the
// module has no such action or it takes no input.
export function moduleInputSchema(
  module: DocumentModelModule,
  actionType: string,
): ActionInputSchema | undefined {
  const model = describeModel(module);
  const action = model.actions.find((entry) => entry.type === actionType);
  if (!action?.inputSchema) return undefined;
  return (
    parseActionInputSchema(
      withReferencedEnums(action.inputSchema, model.stateSchema),
      actionType,
    ) ?? undefined
  );
}

// One field per input field of the chosen action, rebuilt when it changes.
export const actionInputProp = (displayName = "Input") =>
  Property.DynamicProperties({
    auth: undefined,
    displayName,
    required: false,
    refreshers: ["documentType", "documentId", "actionType"],
    props: async (propsValue, ctx) => {
      const actionType = staticString(propsValue.actionType);
      if (!actionType) return {};
      const module = await targetModule(
        designTimeReactor(ctx),
        propsValue as Record<string, unknown>,
      );
      const schema = module && moduleInputSchema(module, actionType);
      return schema ? inputProps(schema) : {};
    },
  });

// The action and its input, in one card: they only make sense together.
export const ACTION_GROUP = (when: string) => ({
  key: "action",
  display: "section" as const,
  label: "Action",
  description: `${when} Pick a type, then fill in its input: the action needs both.`,
  props: ["actionType", "input"],
});
