import { Module } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { toLowercaseSnakeCase } from "../schemas";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./form";
import { Input } from "./input";
import { useCallback, useEffect } from "react";

const ModuleFormSchema = z.object({
  name: z.string(),
});
type Props = {
  handlers: DocumentActionHandlers;
  module?: Module;
};
export function ModuleForm(props: Props) {
  const { module, handlers } = props;
  const isEdit = !!module;

  const form = useForm<z.infer<typeof ModuleFormSchema>>({
    resolver: zodResolver(ModuleFormSchema),
    defaultValues: {
      name: module?.name ? module.name : "",
    },
  });

  // Update the form's default values when the module prop changes or for the new form with no module
  useEffect(() => {
    if (module) {
      form.reset({ name: module.name }); // reset to module name if editing
    } else {
      form.reset({ name: "" }); // reset to empty string for new form
    }
  }, [module, form]);

  function onSubmit(values: z.infer<typeof ModuleFormSchema>) {
    const name = toLowercaseSnakeCase(values.name);
    if (!name.length) return;

    if (isEdit) {
      if (name !== module.name) {
        handlers.updateModuleName(module.id, name);
      }
    } else {
      handlers.addModule(name);
    }
    form.reset({ name });
  }

  // Handle form submission on blur
  const handleBlur = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form]);

  return (
    <Form {...form}>
      <form className="max-w-screen-sm">
        <FormField
          control={form.control}
          name="name"
          rules={{ required: "Module name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="Add module"
                  {...field}
                  onBlur={handleBlur}
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
