import { z } from "zod";
import { DocumentActionHandlers } from "../types";
import { GraphQLSchema } from "graphql";
import { TextField } from "./text-field";
import { useCallback } from "react";
import { makeInitialSchemaDoc, renameSchemaType } from "../utils";

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
  handlers: DocumentActionHandlers;
  globalStateSchema: string;
  localStateSchema: string;
  schema: GraphQLSchema;
};

export function ModelMetadata(props: Props) {
  return (
    <div className="grid grid-cols-[2fr,1fr] gap-8">
      <div>
        <ModelNameForm {...props} />
        <DocumentTypeForm {...props} />
        <DescriptionForm {...props} />
      </div>
      <div>
        <AuthorNameForm {...props} />
        <AuthorWebsiteForm {...props} />
        <ModelExtensionForm {...props} />
      </div>
    </div>
  );
}

export function ModelNameForm(props: Props) {
  const { name, handlers, globalStateSchema, localStateSchema, schema } = props;

  const onSubmit = useCallback(
    (newName: string) => {
      if (name === newName) {
        return;
      }
      handlers.setModelName(newName);

      const hasExistingSchema = !!globalStateSchema;

      if (!hasExistingSchema) {
        const initialSchemaDoc = makeInitialSchemaDoc(newName, "global");
        handlers.setStateSchema(initialSchemaDoc, "global");
        return;
      }
      const newSchema = renameSchemaType(
        globalStateSchema,
        name,
        newName,
        "global",
      );
      handlers.setStateSchema(newSchema, "global");

      if (localStateSchema) {
        const newLocalStateSchema = renameSchemaType(
          localStateSchema,
          name,
          newName,
          "local",
        );
        handlers.setStateSchema(newLocalStateSchema, "local");
      }
    },
    [name, globalStateSchema, localStateSchema, handlers, schema],
  );

  return (
    <TextField
      name="name"
      value={name}
      onSubmit={onSubmit}
      placeholder="Model name"
      className="mb-2 text-lg"
      required
      focusOnMount
    />
  );
}

export function DocumentTypeForm(props: Props) {
  const { documentType, handlers } = props;

  return (
    <TextField
      name="documentType"
      value={documentType}
      onSubmit={handlers.setModelId}
      placeholder="Document Type"
      className="mb-2 w-1/2"
      required
    />
  );
}

export function ModelExtensionForm(props: Props) {
  const { extension, handlers } = props;

  return (
    <TextField
      name="extension"
      value={extension}
      onSubmit={handlers.setModelExtension}
      placeholder="Model Extension"
      className="mb-2"
      required
    />
  );
}

export function DescriptionForm(props: Props) {
  const { description, handlers } = props;

  return (
    <TextField
      name="description"
      value={description}
      onSubmit={handlers.setModelDescription}
      placeholder="Model Description"
      className="mb-2"
      allowEmpty
    />
  );
}

export function AuthorNameForm(props: Props) {
  const { authorName, handlers } = props;

  return (
    <TextField
      name="authorName"
      value={authorName}
      onSubmit={handlers.setAuthorName}
      placeholder="Author Name"
      className="mb-2"
      allowEmpty
    />
  );
}

export function AuthorWebsiteForm(props: Props) {
  const { authorWebsite, handlers } = props;

  return (
    <TextField
      name="authorWebsite"
      value={authorWebsite}
      onSubmit={(newAuthorWebsite) => {
        if (!!authorWebsite && !newAuthorWebsite) return;
        handlers.setAuthorWebsite(newAuthorWebsite);
      }}
      placeholder="https://my-website.com"
      className="mb-2"
      allowEmpty
    />
  );
}
