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
} from "../../components/ui/form";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../../components/ui/select";
import { Input } from "../ui/input";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Button } from "@powerhousedao/design-system";
import {
  ConstantCaseSchema,
  OperationTypeSchema,
  NoWhitespaceSchema,
  ScopeSchema,
} from "../../schemas/inputs";
import { useSchema } from "../../context/SchemaContext";
import { useDocumentModel } from "../../context/DocumentModelContext";
import { makeOperationContent } from "../../lib";
import { Module as TModule } from "document-model/document-model";
import { addDoc } from "../../store/docStore";

const OperationFormSchema = z.object({
  name: ConstantCaseSchema,
  operationType: OperationTypeSchema,
  inputName: NoWhitespaceSchema,
  inputType: NoWhitespaceSchema,
  scope: ScopeSchema,
});

export type OperationFormValues = z.infer<typeof OperationFormSchema>;

type Props = {
  module: TModule;
  setShowForm: (show: boolean) => void;
};
export function OperationForm(props: Props) {
  const { module, setShowForm } = props;
  const { existingTypeNames, existingOperationNames, hasLocalState } =
    useSchema();
  const { handlers } = useDocumentModel();

  const form = useForm<OperationFormValues>({
    resolver: zodResolver(OperationFormSchema),
    defaultValues: {
      name: "CREATE_SOMETHING",
      operationType: "CREATE",
      inputName: "something",
      inputType: "String",
      scope: "global",
    },
  });

  const {
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = form;
  function onSubmit(values: OperationFormValues) {
    const { name, doc } = makeOperationContent(values);
    if (existingOperationNames.includes(name)) {
      setError("name", {
        type: "custom",
        message:
          "Operation names must be unique, and you have already created an operation with these inputs.",
      });
      return;
    }
    handlers.addOperation(module.id, name);
    addDoc(name, doc);
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
          name="operationType"
          rules={{ required: "Operation type is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Operation Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an operation type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {OperationTypeSchema.options
                    .map((o) => o.value)
                    .map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormDescription>What should this operation do?</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="inputName"
          rules={{ required: "Input name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Input Name</FormLabel>
              <FormControl>
                <Input placeholder="something" {...field} />
              </FormControl>
              <FormDescription>
                Your operation's input name. Ideally this should correspond to a
                field in your state.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="inputType"
          rules={{ required: "Input type is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Input Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose input type" />
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
                The type of the operation's input.
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
              <FormItem>
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
        {errors.name && <p className="text-red-900">{errors.name.message}</p>}
        <div className="flex">
          <Button
            onClick={() => {
              reset();
              setShowForm(false);
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
