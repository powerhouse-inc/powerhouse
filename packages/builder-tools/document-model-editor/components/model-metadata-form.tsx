import { useCallback } from "react";
import { z } from "zod";
import type { Scope } from "../types/documents.js";
import {
  makeInitialSchemaDoc,
  renameSchemaType,
  handleModelNameChange,
} from "../utils/helpers.js";
import { TextField } from "./text-field.js";

export const MetadataFormSchema = z.object({
  name: z.string(),
  documentType: z.string(),
  extension: z.string(),
  description: z.string(),
  authorName: z.string(),
  authorWebsite: z.string(),
});

export type MetadataFormValues = z.infer<typeof MetadataFormSchema>;

type Props = MetadataFormValues & {
  globalStateSchema: string;
  localStateSchema: string;
  setModelName: (name: string) => void;
  setModelId: (id: string) => void;
  setModelExtension: (extension: string) => void;
  setModelDescription: (description: string) => void;
  setAuthorName: (authorName: string) => void;
  setAuthorWebsite: (authorWebsite: string) => void;
  setStateSchema: (schema: string, scope: Scope) => void;
};

export function ModelMetadata(props: Props) {
  return (
    <div>
      <ModelNameForm {...props} />
      <div className="flex h-full flex-col gap-4">
        <div className="grid flex-1 grid-cols-3 items-start gap-4">
          <div className="col-span-2 flex h-full flex-col gap-4">
            <div className="shrink-0">
              <DocumentTypeForm {...props} />
            </div>
            <div className="min-h-0 flex-1">
              <DescriptionForm {...props} />
            </div>
          </div>
          <div className="col-span-1 flex flex-col gap-4">
            <AuthorNameForm {...props} />
            <AuthorWebsiteForm {...props} />
            <ModelExtensionForm {...props} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelNameForm(props: Props) {
  const {
    name,
    globalStateSchema,
    localStateSchema,
    setModelName,
    setStateSchema,
  } = props;

  const onSubmit = useCallback(
    (newName: string) => {
      if (name === newName) {
        return;
      }
      setModelName(newName);

      const hasExistingSchema = !!globalStateSchema;

      if (!hasExistingSchema) {
        const initialSchemaDoc = makeInitialSchemaDoc(newName, "global");
        setStateSchema(initialSchemaDoc, "global");
        return;
      }
      const newSchema = renameSchemaType(
        globalStateSchema,
        name,
        newName,
        "global",
      );
      setStateSchema(newSchema, "global");

      if (localStateSchema) {
        const newLocalStateSchema = renameSchemaType(
          localStateSchema,
          name,
          newName,
          "local",
        );
        setStateSchema(newLocalStateSchema, "local");
      }
      handleModelNameChange({
        oldName: name,
        newName,
        globalStateSchema,
        localStateSchema,
        setStateSchema,
      });
    },
    [name, globalStateSchema, localStateSchema, setStateSchema],
  );

  return (
    <TextField
      name="name"
      value={name}
      onSubmit={onSubmit}
      placeholder="Model name"
      className="border-none pl-0 text-xl font-bold text-gray-900"
      required
      focusOnMount
    />
  );
}

export function DocumentTypeForm(props: Props) {
  const { documentType, setModelId } = props;

  return (
    <TextField
      label="Document Type"
      name="powerhouse/document-model"
      value={documentType}
      onSubmit={setModelId}
      placeholder="Document Type"
      required
    />
  );
}

export function ModelExtensionForm(props: Props) {
  const { extension, setModelExtension } = props;

  return (
    <TextField
      name="extension"
      value={extension}
      onSubmit={setModelExtension}
      label="Model Extension"
      placeholder="Example .phdm"
      required
    />
  );
}

export function DescriptionForm(props: Props) {
  const { description, setModelDescription } = props;

  return (
    <TextField
      name="description"
      label="Model Description"
      value={description}
      onSubmit={setModelDescription}
      placeholder="Describe your document to others"
      allowEmpty
      className="h-full"
    />
  );
}

export function AuthorNameForm(props: Props) {
  const { authorName, setAuthorName } = props;

  return (
    <TextField
      name="authorName"
      value={authorName}
      onSubmit={setAuthorName}
      label="Author Name"
      placeholder="Username or organisation"
      allowEmpty
    />
  );
}

export function AuthorWebsiteForm(props: Props) {
  const { authorWebsite, setAuthorWebsite } = props;

  return (
    <TextField
      name="authorWebsite"
      value={authorWebsite}
      label="Website URL"
      onSubmit={(newAuthorWebsite) => {
        if (!!authorWebsite && !newAuthorWebsite) return;
        setAuthorWebsite(newAuthorWebsite);
      }}
      placeholder="https://www.powerhouse.inc/"
      allowEmpty
    />
  );
}
