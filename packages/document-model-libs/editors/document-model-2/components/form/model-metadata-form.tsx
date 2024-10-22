import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Button } from "@powerhousedao/design-system";
import { getDocumentMetadata } from "../../lib/document";
import { EmptyStringSchema } from "../../schemas/util";
import { AuthorSchema } from "../../schemas/document-model";
import { useDocumentModel } from "../../context/DocumentModelContext";
import { useFormManager } from "../../context/FormManager";
import { getDifferences } from "../../lib/diff";

export const CreateMetadataFormSchema = z.object({
  name: z.string(),
  extension: EmptyStringSchema,
  documentType: z.string().default("powerhouse/document-model"),
  author: AuthorSchema,
});

export const EditModelMetadataSchema = CreateMetadataFormSchema.partial();

export type ModelModelMetadataFormValues = z.infer<
  typeof CreateMetadataFormSchema | typeof EditModelMetadataSchema
>;

export function ModelMetadataForm() {
  const { document, handlers, hasSetInitialMetadata } = useDocumentModel();
  const { closeForm } = useFormManager();
  const isEdit = !!document && hasSetInitialMetadata;
  const formSchema = isEdit
    ? EditModelMetadataSchema
    : CreateMetadataFormSchema;
  const defaultValues = isEdit
    ? getDocumentMetadata(document)
    : {
        name: "",
        documentType: "powerhouse/document-model",
        extension: "",
        author: {
          name: "",
          website: "",
        },
      };
  const form = useForm<ModelModelMetadataFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { control, reset, handleSubmit } = form;

  function onSubmit(values: ModelModelMetadataFormValues) {
    const diff = document
      ? getDifferences(getDocumentMetadata(document), values)
      : values;

    const { name, extension, author } = diff;
    const { setModelName, setModelExtension, setAuthorName, setAuthorWebsite } =
      handlers;

    if (name) {
      setModelName(name);
    }

    if (extension) {
      setModelExtension(extension);
    }

    if (author?.name) {
      setAuthorName(author.name);
    }

    if (author?.website) {
      setAuthorWebsite(author.website);
    }
    reset();
    closeForm();
  }

  return (
    <Form {...form}>
      <h2 className="mb-4 mt-8 text-lg font-semibold">Add a new type</h2>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mb-12 max-w-screen-sm  space-y-8"
      >
        <FormField
          control={control}
          name="name"
          rules={{ required: "Model name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model Name</FormLabel>
              <FormControl>
                <Input placeholder="Name" {...field} />
              </FormControl>
              <FormDescription>
                The name of your new Document Model.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="documentType"
          rules={{ required: "Document type is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document Type</FormLabel>
              <FormControl>
                <Input placeholder="MyDocument" {...field} />
              </FormControl>
              <FormDescription>
                The type name for your new Document Model.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="extension"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model Extension</FormLabel>
              <FormControl>
                <Input placeholder=".example.ph" {...field} />
              </FormControl>
              <FormDescription>
                The file extension for your new Document Model.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="author.name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Author Name</FormLabel>
              <FormControl>
                <Input placeholder="0xMyName" {...field} />
              </FormControl>
              <FormDescription>Your pseudonym</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="author.website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Author Website</FormLabel>
              <FormControl>
                {/* @ts-expect-error - type error from shadcn */}
                <Input placeholder="https://my-website.com" {...field} />
              </FormControl>
              <FormDescription>Your website</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex">
          <Button
            onClick={() => {
              reset();
              closeForm();
            }}
            type="button"
            className="w-full bg-white text-red-900"
          >
            Cancel
          </Button>
          <Button type="submit" className="text-primary w-full bg-white">
            Submit
          </Button>
        </div>
      </form>
    </Form>
  );
}
