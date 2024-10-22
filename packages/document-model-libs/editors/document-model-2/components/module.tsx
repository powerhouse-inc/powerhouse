import { Button } from "@powerhousedao/design-system";
import { useState } from "react";
import { Module as TModule } from "document-model/document-model";
import { OperationForm } from "./form/operation-form";
import { useSchema, useDocumentModel } from "../context";
import { renameModule } from "../store";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { ModuleFormValues, ModuleFormSchema } from "./form/module-form";
import { toLowercaseSnakeCase } from "../lib/utils";
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
import { OperationEditor } from "./operation-editor";

type Props = {
  module: TModule;
};
export function Module(props: Props) {
  const { module } = props;
  const { existingModuleNames } = useSchema();
  const { handlers } = useDocumentModel();
  const [showOperationForm, setShowOperationForm] = useState(false);
  const [isEditingModuleName, setIsEditingModuleName] = useState(false);
  const [operationNameBeingEdited, setOperationNameBeingEdited] =
    useState<string>();

  const form = useForm<ModuleFormValues>({
    resolver: zodResolver(ModuleFormSchema(existingModuleNames)),
    defaultValues: {
      name: module.name,
    },
  });

  const { reset, handleSubmit } = form;
  const nameFromForm = useWatch({ control: form.control, name: "name" });

  function onSubmit(values: ModuleFormValues) {
    const name = toLowercaseSnakeCase(values.name);
    renameModule(module.name, name);
    handlers.updateModuleName(module.id, name);
    reset();
    setIsEditingModuleName(false);
  }

  function onEditOperationNameClick(name: string | undefined) {
    setOperationNameBeingEdited(name);
    if (name) {
      setIsEditingModuleName(false);
      setShowOperationForm(false);
    }
  }

  function onEditModuleNameClick(isEditing: boolean) {
    if (!isEditing) {
      setIsEditingModuleName(false);
    } else {
      setIsEditingModuleName(true);
      setOperationNameBeingEdited(undefined);
      setShowOperationForm(false);
    }
  }

  return (
    <div>
      {isEditingModuleName ? (
        <Form {...form}>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mb-12 h-9 max-w-screen-sm space-y-8 px-4 py-2"
          >
            <FormField
              control={form.control}
              name="name"
              rules={{ required: "Module name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Module Name</FormLabel>
                  <FormControl>
                    <Input placeholder="my_module" {...field} />
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
                  setIsEditingModuleName(false);
                }}
                type="button"
                className="w-full bg-white text-red-900"
              >
                Cancel
              </Button>
              <Button
                disabled={nameFromForm === module.name}
                type="submit"
                className="text-primary w-full bg-white"
              >
                Submit
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <div className="flex items-baseline gap-4">
          <h1 className="mb-2 text-lg">
            Module name: <span className="font-semibold">{module.name}</span>
          </h1>
          <button onClick={() => onEditModuleNameClick(true)}>Edit name</button>
        </div>
      )}
      {!isEditingModuleName && (
        <>
          {operationNameBeingEdited ? (
            <OperationEditor
              operation={
                module.operations.find(
                  (operation) => operation.name === operationNameBeingEdited,
                )!
              }
              module={module}
              isEditingOperationName={true}
              onEditOperationNameClick={onEditOperationNameClick}
            />
          ) : (
            module.operations.map((operation) => (
              <OperationEditor
                key={operation.name}
                operation={operation}
                module={module}
                isEditingOperationName={
                  operationNameBeingEdited === operation.name
                }
                onEditOperationNameClick={onEditOperationNameClick}
              />
            ))
          )}
        </>
      )}
      {showOperationForm ? (
        <OperationForm module={module} setShowForm={setShowOperationForm} />
      ) : (
        !isEditingModuleName &&
        !operationNameBeingEdited && (
          <Button onClick={() => setShowOperationForm(true)}>
            Add Operation
          </Button>
        )
      )}
    </div>
  );
}
