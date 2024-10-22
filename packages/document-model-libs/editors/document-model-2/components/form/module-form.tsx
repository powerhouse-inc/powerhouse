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
import { UniqueNameSchema } from "../../schemas/inputs";
import { useSchema } from "../../context/SchemaContext";
import { toLowercaseSnakeCase } from "../../lib/utils";
import { useDocumentModel } from "../../context/DocumentModelContext";
import { useFormManager } from "../../context/FormManager";

export function ModuleFormSchema(existingModuleNames: string[]) {
  return z.object({
    name: UniqueNameSchema(existingModuleNames),
  });
}

export type ModuleFormValues = z.infer<ReturnType<typeof ModuleFormSchema>>;

export function ModuleForm() {
  const { handlers } = useDocumentModel();
  const { existingModuleNames } = useSchema();
  const { closeForm } = useFormManager();

  const form = useForm<ModuleFormValues>({
    resolver: zodResolver(ModuleFormSchema(existingModuleNames)),
    defaultValues: {
      name: "",
    },
  });

  const { reset, handleSubmit } = form;

  function onSubmit(values: ModuleFormValues) {
    const name = toLowercaseSnakeCase(values.name);
    handlers.addModule(name);
    reset();
    closeForm();
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
          rules={{ required: "Module name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Module Name</FormLabel>
              <FormControl>
                <Input placeholder="my_module" {...field} />
              </FormControl>
              <FormDescription>
                Your module's name. Ideally this should correspond to a field in
                your state.
              </FormDescription>
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
