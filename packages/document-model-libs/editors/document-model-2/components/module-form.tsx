import { Module } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { toLowercaseSnakeCase } from "../schemas";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "./form";
import { Input } from "./input";
import { useCallback } from "react";

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
      name: module?.name ?? "",
    },
  });

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
      <form>
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      form.handleSubmit(onSubmit)();
                    }
                  }}
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
