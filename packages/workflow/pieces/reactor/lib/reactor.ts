// Reaching the reactor from piece code, and the props whose choices come
// from it.

// `ctx.reactor` is served by the host over the worker's call channel and only
// to a piece an installed reactor package ships. Absent, reactorOf throws by
// name, so a piece that ends up somewhere else fails legibly.
import {
  Property,
  reactorOf,
  type ReactorService,
} from "@powerhousedao/pieces-framework";
import { staticString } from "./parse.js";
import { inputProps } from "./input-props.js";
import {
  parseActionInputSchema,
  type ActionInputSchema,
} from "./input-schema.js";
import { folderOptions, withReferencedEnums } from "./schema-text.js";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

interface OptionEntry {
  label: string;
  value: string;
  // actionType only: the input's SDL and the model it belongs to, which the
  // editor's action list builds a form from and validates against.
  inputSchema?: string;
  documentType?: string;
}

interface OptionState {
  options: OptionEntry[];
  placeholder?: string;
}

const SET_NAME: OptionEntry = {
  label: "SET_NAME (base)",
  value: "SET_NAME",
  inputSchema: "input SetNameInput {\n  name: String!\n}",
};

async function documentOptions(
  reactor: ReactorService,
  documentType: string | undefined,
): Promise<OptionState> {
  const documents = await reactor.find(documentType ? { documentType } : {});
  const nameOf = (document: (typeof documents)[number]) =>
    document.name || document.slug || "(unnamed)";
  const seen = new Map<string, number>();
  for (const document of documents) {
    seen.set(nameOf(document), (seen.get(nameOf(document)) ?? 0) + 1);
  }
  return {
    options: documents.map((document) => {
      const name = nameOf(document);
      // Two documents of one name are told apart by slug, else a short id.
      const shown =
        (seen.get(name) ?? 0) > 1
          ? `${name} (${document.slug && document.slug !== name ? document.slug : document.documentId.slice(0, 8)})`
          : name;
      // The type is noise when every option shares it.
      return {
        label: documentType ? shown : `${shown} — ${document.documentType}`,
        value: document.documentId,
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
    options: async (_propsValue, ctx) => {
      const models = await reactorOf(ctx).models();
      return {
        options: models
          .map((model) => ({
            label: model.name
              ? `${model.name} (${model.documentType})`
              : model.documentType,
            value: model.documentType,
          }))
          .sort((a, b) => a.value.localeCompare(b.value)),
      };
    },
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
      documentOptions(reactorOf(ctx), staticString(propsValue.documentType)),
  });

export const driveProp = (displayName: string, description?: string) =>
  Property.Dropdown<string>({
    auth: undefined,
    displayName,
    description,
    required: false,
    refreshers: [],
    options: (_propsValue, ctx) =>
      documentOptions(reactorOf(ctx), DRIVE_DOCUMENT_TYPE),
  });

// A folder inside the drive the `driveProp` sibling names, labelled by path;
// the step files the document there instead of at the drive's root.
export const folderProp = (
  displayName: string,
  driveProp: string,
  description?: string,
) =>
  Property.Dropdown<string>({
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
      const drive = await reactorOf(ctx).get({ documentId: driveId });
      const options = folderOptions(drive.state);
      return {
        options,
        placeholder: options.length
          ? `Folders in ${drive.name || "this drive"}`
          : `${drive.name || "This drive"} has no folders`,
      };
    },
  });

// A JSON array of {type, input, scope?}, for several actions in one step or
// a payload an earlier step produced. Advanced: the single action is the form.
export const actionsProp = (displayName: string, description?: string) =>
  Property.Json({ displayName, required: false, description, advanced: true });

// The target type's own actions, each carrying its input SDL, plus the base
// actions every document accepts.
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
      const reactor = reactorOf(ctx);
      let documentType = staticString(propsValue.documentType);
      if (!documentType) {
        // A resolvable id names its own type, which is what a step that only
        // knows the document has to offer.
        const documentId = staticString(propsValue.documentId);
        if (documentId) {
          documentType = (await reactor.get({ documentId })).documentType;
        }
      }
      if (!documentType) {
        return {
          disabled: true,
          options: [SET_NAME],
          placeholder: "Pick a document type first",
        };
      }
      const model = await reactor.model(documentType);
      return {
        options: [
          ...model.actions.map((action) => ({
            label: `${action.type} (${action.module})`,
            value: action.type,
            documentType,
            ...(action.inputSchema
              ? {
                  inputSchema: withReferencedEnums(
                    action.inputSchema,
                    model.stateSchema,
                  ),
                }
              : {}),
          })),
        ],
        placeholder: `Actions of ${documentType}`,
      };
    },
  });

// The model a step targets: named, or read off the document it names.
async function targetType(
  reactor: ReactorService,
  propsValue: Record<string, unknown>,
): Promise<string | undefined> {
  const named = staticString(propsValue.documentType);
  if (named) return named;
  const documentId = staticString(propsValue.documentId);
  return documentId
    ? (await reactor.get({ documentId })).documentType
    : undefined;
}

// The chosen action's input schema, with the enums it uses; undefined when the
// step doesn't yet say which model and action.
export async function actionInputSchema(
  reactor: ReactorService,
  propsValue: Record<string, unknown>,
): Promise<ActionInputSchema | undefined> {
  const actionType = staticString(propsValue.actionType);
  if (!actionType) return undefined;
  const documentType = await targetType(reactor, propsValue);
  if (!documentType) return undefined;
  const model = await reactor.model(documentType);
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
      const schema = await actionInputSchema(
        reactorOf(ctx),
        propsValue as Record<string, unknown>,
      );
      return schema ? inputProps(schema) : {};
    },
  });

// The action and its input, in one card: they only make sense together.
export const ACTION_GROUP = (description: string) => ({
  key: "action",
  display: "section" as const,
  label: "Action",
  description,
  props: ["actionType", "input"],
});
