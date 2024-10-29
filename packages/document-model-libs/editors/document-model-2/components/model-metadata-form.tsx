import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "./form";
import { Input } from "./input";

export const MetadataFormSchema = z.object({
  name: z.string().min(1),
  extension: z.string().optional(),
  documentType: z.string().min(1),
  description: z.string().optional(),
  author: z
    .object({
      name: z.string().optional(),
      website: z.string().optional(),
    })
    .optional(),
});

export type MetadataFormValues = z.infer<typeof MetadataFormSchema>;

type Props = MetadataFormValues & {
  onSubmit: (values: MetadataFormValues) => void;
};
export function ModelMetadataForm(props: Props) {
  const { name, documentType, extension, description, author, onSubmit } =
    props;

  const form = useForm<MetadataFormValues>({
    resolver: zodResolver(MetadataFormSchema),
    defaultValues: {
      name,
      documentType,
      description,
      extension: extension || ".phdm",
      author: {
        name: author?.name ?? "",
        website: author?.website ?? "",
      },
    },
  });

  const { control, handleSubmit } = form;

  return (
    <Form {...form}>
      <h2 className="mb-4 mt-8 text-lg font-semibold">New Document Model</h2>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mb-12 max-w-screen-sm  space-y-4"
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
          rules={{ required: "Model extension is required" }}
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model Description</FormLabel>
              <FormControl>
                <Input placeholder="MyModel works like..." {...field} />
              </FormControl>
              <FormDescription>
                The description name for your new Document Model.
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
                <Input placeholder="https://my-website.com" {...field} />
              </FormControl>
              <FormDescription>Your website</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <button
          className="mb-4 w-full rounded-lg border border-gray-500 bg-white px-5 py-1 text-gray-900"
          type="submit"
        >
          Submit
        </button>
      </form>
    </Form>
  );
}
