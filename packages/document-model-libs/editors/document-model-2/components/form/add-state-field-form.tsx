import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
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
import { z } from "zod";
import { Checkbox } from "../ui/checkbox";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { useEffect, useState } from "react";
import { GraphQLFieldMap } from "graphql";
import { Button } from "@powerhousedao/design-system";
import { UniqueNameSchema } from "../../schemas/inputs";

export function AddStateFieldFormSchema(params: {
  existingFieldNames: string[];
}) {
  const { existingFieldNames } = params;
  return z.object({
    scope: z.literal("global").or(z.literal("local")),
    name: UniqueNameSchema(existingFieldNames),
    type: z.string().min(1),
    isList: z.boolean().optional(),
    isNonNull: z.boolean().optional(),
  });
}

export type AddStateFieldFormValues = z.infer<
  ReturnType<typeof AddStateFieldFormSchema>
>;

type Props = {
  existingTypeNames: string[];
  hasLocalState: boolean;
  existingLocalStateFields: GraphQLFieldMap<any, any> | undefined;
  existingGlobalStateFields: GraphQLFieldMap<any, any> | undefined;
  onSubmitAddStateField(values: AddStateFieldFormValues): void;
  setShowForm: (value: boolean) => void;
};

export function AddStateFieldForm(props: Props) {
  const {
    existingTypeNames,
    existingLocalStateFields = {},
    existingGlobalStateFields = {},
    hasLocalState,
    onSubmitAddStateField,
    setShowForm,
  } = props;
  const [scope, setScope] = useState<"global" | "local">("global");

  const existingFields =
    scope === "local" ? existingLocalStateFields : existingGlobalStateFields;
  const existingFieldNames = Object.keys(existingFields);
  const form = useForm<AddStateFieldFormValues>({
    resolver: zodResolver(
      AddStateFieldFormSchema({
        existingFieldNames,
      }),
    ),
    defaultValues: {
      scope: "global",
      name: "",
      type: "String",
      isList: false,
      isNonNull: true,
    },
  });

  const { handleSubmit, reset, control } = form;

  const scopeFromForm = useWatch({ control, name: "scope" });

  useEffect(() => {
    setScope(scopeFromForm);
  }, [scopeFromForm]);

  function onSubmit(values: AddStateFieldFormValues) {
    onSubmitAddStateField(values);
    reset();
    setShowForm(false);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mb-12 h-9 max-w-screen-sm space-y-8 px-4 py-2"
      >
        <FormField
          control={form.control}
          name="name"
          rules={{ required: "Field name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Field Name</FormLabel>
              <FormControl>
                <Input placeholder="myField" {...field} />
              </FormControl>
              <FormDescription>
                The name of the field in your State type.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {hasLocalState && (
          <FormField
            control={form.control}
            name="scope"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Scope</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex flex-col space-y-1"
                  >
                    <FormItem className="flex items-center space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="global" />
                      </FormControl>
                      <FormLabel className="font-normal">Global</FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="local" />
                      </FormControl>
                      <FormLabel className="font-normal">Local</FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="type"
          rules={{ required: "Field type is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Field Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                The type of the field in your State type.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isList"
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
              <FormDescription>Whether the field is a list.</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isNonNull"
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
              <FormDescription>Whether the field is non-null.</FormDescription>
            </FormItem>
          )}
        />
        <Button type="submit" className="text-primary w-full bg-white">
          Submit
        </Button>
      </form>
    </Form>
  );
}
