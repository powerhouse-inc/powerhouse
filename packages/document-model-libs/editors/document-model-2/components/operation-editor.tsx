import { Operation, Module } from "document-model/document-model";
import { useSchema, useDocumentModel } from "../context";
import { GraphqlEditor } from "./graphql-editor";
import { UniqueNameSchema, ConstantCaseSchema } from "../schemas";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toConstantCase } from "../lib";
import { renameOperation } from "../store";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { Button } from "@powerhousedao/design-system";
function OperationNameFormSchema(existingOperationNames: string[]) {
  return z.object({
    name: UniqueNameSchema(existingOperationNames).and(ConstantCaseSchema),
  });
}
type OperationNameFormValues = z.infer<
  ReturnType<typeof OperationNameFormSchema>
>;
type Props = {
  operation: Operation;
  module: Module;
  isEditingOperationName: boolean;
  onEditOperationNameClick: (name: string | undefined) => void;
};
export function OperationEditor(props: Props) {
  const {
    module,
    operation,
    isEditingOperationName,
    onEditOperationNameClick,
  } = props;
  const operationName = operation.name!;
  const { handlers } = useDocumentModel();
  const { schema, existingOperationNames } = useSchema();
  const form = useForm<OperationNameFormValues>({
    resolver: zodResolver(OperationNameFormSchema(existingOperationNames)),
    defaultValues: {
      name: operationName,
    },
  });

  const { reset, handleSubmit } = form;
  const nameFromForm = useWatch({ control: form.control, name: "name" });

  function onSubmit(values: OperationNameFormValues) {
    const newName = toConstantCase(values.name);
    renameOperation(module.name, operationName, newName);
    handlers.updateOperationName(operation.id, newName);
    reset();
    onEditOperationNameClick(undefined);
  }

  return (
    <div>
      <div className="flex items-baseline gap-4 mb-1">
        <h2 className="text-sm">
          Operation name: <span className="font-semibold">{operationName}</span>
        </h2>{" "}
        <button onClick={() => onEditOperationNameClick(operationName)}>
          Edit name
        </button>
      </div>
      {isEditingOperationName ? (
        <Form {...form}>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mb-12 h-9 max-w-screen-sm space-y-8 px-4 py-2"
          >
            <FormField
              control={form.control}
              name="name"
              rules={{ required: "Operation name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operation Name</FormLabel>
                  <FormControl>
                    <Input placeholder="CREATE_SOMETHING" {...field} />
                  </FormControl>
                  <FormDescription>
                    Your module's name. Ideally this should correspond to a
                    field in your state.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex">
              <Button
                onClick={() => {
                  reset();
                  onEditOperationNameClick(undefined);
                }}
                type="button"
                className="w-full bg-white text-red-900"
              >
                Cancel
              </Button>
              <Button
                disabled={nameFromForm === operationName}
                type="submit"
                className="text-primary w-full bg-white"
              >
                Submit
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <GraphqlEditor id={operationName} schema={schema} />
      )}
    </div>
  );
}
