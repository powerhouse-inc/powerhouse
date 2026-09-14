// Reaching the reactor from piece code, and the props whose choices come
// from it.

// `ctx.reactor` is served by the host over the worker's call channel and only
// to a piece an installed reactor package ships. Absent, it is a stub that
// throws by name, so a piece that ends up somewhere else fails legibly.
import { Property } from "@activepieces/pieces-framework";
import type { ReactorService } from "@powerhousedao/reactor-connectors";
import { staticString } from "./parse.js";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

// Both contexts a resolver or a run can be handed carry it; neither framework
// type declares it, because no other host serves it.
export function reactorOf(ctx: unknown): ReactorService {
  return (ctx as { reactor: ReactorService }).reactor;
}

interface OptionEntry {
  label: string;
  value: string;
  // actionType only: SDL of the operation's input type, which the editor's
  // action list turns into a starter input object.
  inputSchema?: string;
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
  const documents = await reactor.find(
    documentType ? { documentType } : {},
  );
  return {
    options: documents.map((document) => ({
      label: `${document.name || document.slug || "(unnamed)"} — ${document.documentType}`,
      value: document.documentId,
    })),
    placeholder: documentType
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
            label: model.name ? `${model.name} (${model.documentType})` : model.documentType,
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

// The actions to dispatch: a JSON array of {type, input, scope?}. This editor
// renders it as a list whose types come from actionTypeProp below; elsewhere
// it is the JSON it says it is.
export const actionsProp = (displayName: string, required = false) =>
  Property.Json({
    displayName,
    description:
      'e.g. [{ "type": "SET_NAME", "input": { "name": "Invoice" } }]',
    required,
  });

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
          options: [SET_NAME],
          placeholder:
            "Set a document type (or a resolvable document id) to list its actions",
        };
      }
      const model = await reactor.model(documentType);
      return {
        options: [
          ...model.actions.map((action) => ({
            label: `${action.type} (${action.module})`,
            value: action.type,
            ...(action.inputSchema ? { inputSchema: action.inputSchema } : {}),
          })),
        ],
        placeholder: `Actions of ${documentType}`,
      };
    },
  });
