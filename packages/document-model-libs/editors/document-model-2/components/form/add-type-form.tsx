import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { Checkbox } from "../ui/checkbox";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../ui/select";
import { Button } from "@powerhousedao/design-system";
import { UniqueNameSchema } from "../../schemas/inputs";
import { useSchema } from "../../context/SchemaContext";
import { onSubmitAddType } from "../../lib/forms";
import { useFormManager } from "../../context/FormManager";

export const TypeFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  isList: z.boolean(),
  isNonNull: z.boolean(),
  isDefault: z.boolean().optional(),
});

export function AddTypeFormSchema(existingTypeNames: string[]) {
  return z.object({
    name: UniqueNameSchema(existingTypeNames),
    fields: z
      .array(TypeFieldSchema)
      .min(1, { message: "At least one field is required." })
      .refine(
        (fields) => {
          const names = fields.map((field) => field.name.toLowerCase());
          return new Set(names).size === names.length;
        },
        { message: "Field names must be unique." },
      ),
  });
}

export type AddTypeFormValues = z.infer<ReturnType<typeof AddTypeFormSchema>>;

export function AddTypeForm() {
  const { schema, existingTypeNames } = useSchema();
  const { closeForm } = useFormManager();
  const form = useForm<AddTypeFormValues>({
    resolver: zodResolver(AddTypeFormSchema(existingTypeNames)),
    defaultValues: {
      name: "",
      fields: [{ name: "id", type: "ID", isList: false, isNonNull: true }],
    },
  });

  const { control, reset } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "fields",
  });

  function onSubmit(values: AddTypeFormValues) {
    onSubmitAddType(values, schema);
    reset();
    closeForm();
  }

  return (
    <Form {...form}>
      <h2 className="mb-4 mt-8 text-lg font-semibold">Add a new type</h2>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mb-12 max-w-screen-sm  space-y-8"
      >
        <FormField
          control={form.control}
          name="name"
          rules={{ required: "Type name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type Name</FormLabel>
              <FormControl>
                <Input placeholder="MyType" {...field} />
              </FormControl>
              <FormDescription>
                The name of your new GraphQL type.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {fields.map((field, index) => (
          <div key={field.id} className="space-y-4">
            <FormField
              control={form.control}
              name={`fields.${index}.name`}
              rules={{ required: "Field name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field Name</FormLabel>
                  <FormControl>
                    <Input placeholder="MyField" {...field} />
                  </FormControl>
                  <FormDescription>
                    The name of the field in your GraphQL type.
                  </FormDescription>
                  <FormMessage />
                  {form.formState.errors.root && (
                    <p className="text-destructive text-[0.8rem] font-medium">
                      {form.formState.errors.root.message}
                    </p>
                  )}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`fields.${index}.type`}
              rules={{ required: "Field type is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose field type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {existingTypeNames.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    The type of the field in your GraphQL type. Can be a default
                    type or a user-defined type.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`fields.${index}.isList`}
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Is list</FormLabel>
                  </div>
                  <FormDescription>
                    Whether the field is a list.
                  </FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`fields.${index}.isNonNull`}
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Is non-null</FormLabel>
                  </div>
                  <FormDescription>
                    Whether the field is non-null.
                  </FormDescription>
                </FormItem>
              )}
            />
            <Button
              type="button"
              onClick={() => remove(index)}
              disabled={fields.length <= 1}
              className="bg-white text-red-600"
            >
              Remove Field
            </Button>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-4">
          <Button
            className="text-primary bg-white"
            type="button"
            onClick={() =>
              append({
                name: "",
                type: "String",
                isList: false,
                isNonNull: false,
              })
            }
          >
            Add field
          </Button>
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
        </div>
      </form>
    </Form>
  );
}
