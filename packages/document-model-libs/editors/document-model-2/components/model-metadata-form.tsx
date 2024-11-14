import { z } from "zod";
import { DocumentActionHandlers } from "../types";
import { TextField } from "./text-field";
import { useCallback } from "react";
import { handleModelNameChange } from "../utils/helpers";

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
};

export function ModelMetadata(props: Props) {
  console.log("name", props.name);
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
  const { name, handlers, globalStateSchema, localStateSchema } = props;

  const onSubmit = useCallback(
    (newName: string) => {
      if (name === newName) {
        return;
      }
      handlers.setModelName(newName);

      handleModelNameChange({
        oldName: name,
        newName,
        globalStateSchema,
        localStateSchema,
        setStateSchema: handlers.setStateSchema,
      });
    },
    [name, globalStateSchema, localStateSchema, handlers],
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
  const { documentType, handlers } = props;

  return (
    <TextField
      label="Document Type"
      name="powerhouse/document-model"
      value={documentType}
      onSubmit={handlers.setModelId}
      placeholder="Document Type"
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
      label="Model Extension"
      placeholder="Example .phdm"
      required
    />
  );
}

export function DescriptionForm(props: Props) {
  const { description, handlers } = props;

  return (
    <TextField
      name="description"
      label="Model Description"
      value={description}
      onSubmit={handlers.setModelDescription}
      placeholder="Describe your document to others"
      allowEmpty
      className="h-full"
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
      label="Author Name"
      placeholder="Username or organisation"
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
      label="Website URL"
      onSubmit={(newAuthorWebsite) => {
        if (!!authorWebsite && !newAuthorWebsite) return;
        handlers.setAuthorWebsite(newAuthorWebsite);
      }}
      placeholder="https://www.powerhouse.inc/"
      allowEmpty
    />
  );
}
