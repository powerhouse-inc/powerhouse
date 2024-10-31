import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormField, FormItem, FormControl, FormMessage } from "./form";
import { useCallback } from "react";
import { DocumentActionHandlers } from "../types";
import { makeInitialSchemaDoc } from "../utils";
import { GraphQLSchema, isObjectType, print } from "graphql";
import { pascalCase } from "change-case";
import {
  renameType,
  mapSchema,
  MapperKind,
  astFromObjectType,
} from "@graphql-tools/utils";
import { Textarea } from "./text-area";

export const MetadataFormSchema = z.object({
  name: z.string(),
  documentType: z.string(),
  extension: z.string(),
  description: z.string(),
  author: z.object({
    name: z.string(),
    website: z.string(),
  }),
});

export type MetadataFormValues = z.infer<typeof MetadataFormSchema>;

type Props = MetadataFormValues & {
  handlers: DocumentActionHandlers;
  globalStateSchema: string;
  globalStateInitialValue: string;
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
        <AuthorForm {...props} />
        <ModelExtensionForm {...props} />
      </div>
    </div>
  );
}

export function ModelNameForm(props: Props) {
  const { name, handlers, globalStateSchema, globalStateInitialValue, schema } =
    props;
  const nameFormSchema = MetadataFormSchema.pick({ name: true });
  type NameFormSchema = z.infer<typeof nameFormSchema>;

  const form = useForm<NameFormSchema>({
    resolver: zodResolver(nameFormSchema),
    defaultValues: {
      name,
    },
  });

  const { control, handleSubmit } = form;

  function onSubmit({ name: newName }: NameFormSchema) {
    if (newName === name) return;
    handlers.setModelName(newName);
    if (newName) {
      if (!globalStateSchema) {
        const initialSchemaDoc = makeInitialSchemaDoc(
          globalStateSchema,
          newName,
          "global",
        );
        handlers.setStateSchema(initialSchemaDoc, "global");

        if (!globalStateInitialValue) {
          const initialStateDoc = "{}";
          handlers.setInitialState(initialStateDoc, "global");
        }
      } else {
        const oldGlobalStateType = schema.getType(`${pascalCase(name)}State`);
        if (!oldGlobalStateType) {
          throw new Error("Expected global state type");
        }
        const newGlobalStateType = renameType(
          oldGlobalStateType,
          `${pascalCase(newName)}State`,
        );
        const schemaWithNewType = mapSchema(schema, {
          [MapperKind.TYPE]: (type) => {
            if (type.name === oldGlobalStateType.name) {
              return newGlobalStateType;
            }
            return type;
          },
        });
        if (!isObjectType(newGlobalStateType)) {
          throw new Error("Expected object type");
        }
        handlers.setStateSchema(
          print(astFromObjectType(newGlobalStateType, schemaWithNewType)),
          "global",
        );
        const oldLocalStateType = schema.getType(
          `${pascalCase(name)}LocalState`,
        );
        if (!oldLocalStateType) {
          return;
        }
        const newLocalStateType = renameType(
          oldLocalStateType,
          `${pascalCase(newName)}LocalState`,
        );
        const schemaWithNewLocalStateType = mapSchema(schema, {
          [MapperKind.TYPE]: (type) => {
            if (type.name === oldLocalStateType.name) {
              return newLocalStateType;
            }
            return type;
          },
        });
        if (!isObjectType(newLocalStateType)) {
          throw new Error("Expected object type");
        }
        handlers.setStateSchema(
          print(
            astFromObjectType(newLocalStateType, schemaWithNewLocalStateType),
          ),
          "local",
        );
      }
    }
  }

  const handleBlur = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form]);

  const onEnterKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        form.handleSubmit(onSubmit)();
      }
    },
    [form],
  );

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          control={control}
          name="name"
          rules={{ required: "Model name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="Model name"
                  {...field}
                  onBlur={handleBlur}
                  onKeyDown={onEnterKeyDown}
                  rows={1}
                  className="mb-2 text-lg"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

export function DocumentTypeForm(props: Props) {
  const { documentType, handlers } = props;

  const documentTypeFormSchema = MetadataFormSchema.pick({
    documentType: true,
  });
  type DocumentTypeFormSchema = z.infer<typeof documentTypeFormSchema>;

  const form = useForm<DocumentTypeFormSchema>({
    resolver: zodResolver(documentTypeFormSchema),
    defaultValues: {
      documentType,
    },
  });

  const { control, handleSubmit } = form;

  function onSubmit({ documentType: newDocumentType }: DocumentTypeFormSchema) {
    if (newDocumentType !== documentType) {
      handlers.setModelId(newDocumentType);
    }
  }

  const handleBlur = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form]);

  const onEnterKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        form.handleSubmit(onSubmit)();
      }
    },
    [form],
  );

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          control={control}
          name="documentType"
          rules={{ required: "Document type is required" }}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="Document Type"
                  {...field}
                  onBlur={handleBlur}
                  onKeyDown={onEnterKeyDown}
                  rows={1}
                  className="mb-2 w-1/2"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

export function ModelExtensionForm(props: Props) {
  const { extension, handlers } = props;

  const extensionFormSchema = MetadataFormSchema.pick({
    extension: true,
  });
  type ExtensionFormSchema = z.infer<typeof extensionFormSchema>;

  const form = useForm<ExtensionFormSchema>({
    resolver: zodResolver(extensionFormSchema),
    defaultValues: {
      extension,
    },
  });

  const { control, handleSubmit } = form;

  function onSubmit({ extension: newExtension }: ExtensionFormSchema) {
    if (newExtension === undefined) return;

    if (newExtension !== extension) {
      handlers.setModelExtension(newExtension);
    }
  }

  const handleBlur = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form]);

  const onEnterKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        form.handleSubmit(onSubmit)();
      }
    },
    [form],
  );

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          control={control}
          name="extension"
          rules={{ required: "Model extension is required" }}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="Model Extension"
                  {...field}
                  onBlur={handleBlur}
                  onKeyDown={onEnterKeyDown}
                  rows={1}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

export function DescriptionForm(props: Props) {
  const { description, handlers } = props;

  const descriptionFormSchema = MetadataFormSchema.pick({
    description: true,
  });

  type DescriptionFormSchema = z.infer<typeof descriptionFormSchema>;

  const form = useForm<DescriptionFormSchema>({
    resolver: zodResolver(descriptionFormSchema),
    defaultValues: {
      description,
    },
  });

  const { control, handleSubmit } = form;

  function onSubmit({ description: newDescription }: DescriptionFormSchema) {
    if (newDescription === undefined) return;

    if (newDescription !== description) {
      handlers.setModuleDescription(newDescription);
    }
  }

  const handleBlur = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form]);

  const onEnterKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        form.handleSubmit(onSubmit)();
      }
    },
    [form],
  );

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="Model Description"
                  {...field}
                  onBlur={handleBlur}
                  onKeyDown={onEnterKeyDown}
                  rows={2}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

export function AuthorForm(props: Props) {
  const { author, handlers } = props;

  const authorFormSchema = MetadataFormSchema.pick({
    author: true,
  });

  type AuthorFormSchema = z.infer<typeof authorFormSchema>;

  const form = useForm<AuthorFormSchema>({
    resolver: zodResolver(authorFormSchema),
    defaultValues: {
      author: {
        name: author.name ?? "",
        website: author.website ?? "",
      },
    },
  });

  const { control, handleSubmit } = form;

  function onSubmit({ author: newAuthor }: AuthorFormSchema) {
    if (newAuthor.name !== author.name) {
      handlers.setAuthorName(newAuthor.name ?? "");
    }
    if (newAuthor.website !== author.website) {
      handlers.setAuthorWebsite(newAuthor.website ?? "");
    }
  }

  const handleBlur = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form]);

  const onEnterKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        form.handleSubmit(onSubmit)();
      }
    },
    [form],
  );

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          control={control}
          name="author.name"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="Author Name"
                  {...field}
                  onBlur={handleBlur}
                  onKeyDown={onEnterKeyDown}
                  rows={1}
                  className="mb-2"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="author.website"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="https://my-website.com"
                  {...field}
                  onBlur={handleBlur}
                  onKeyDown={onEnterKeyDown}
                  rows={1}
                  className="mb-2"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
