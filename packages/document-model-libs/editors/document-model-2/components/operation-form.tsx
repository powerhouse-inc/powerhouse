import { Module, Operation } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { toConstantCase } from "../schemas";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "./form";
import { Input } from "./input";
import { useCallback } from "react";

const OperationFormSchema = z.object({
  name: z.string(),
});
type Props = {
  handlers: DocumentActionHandlers;
  module: Module;
  operation?: Operation;
};
export function OperationForm(props: Props) {
  const { operation, module, handlers } = props;
  const isEdit = !!operation;

  const form = useForm<z.infer<typeof OperationFormSchema>>({
    resolver: zodResolver(OperationFormSchema),
    defaultValues: {
      name: operation?.name ?? "",
    },
  });

  function onSubmit(values: z.infer<typeof OperationFormSchema>) {
    const name = toConstantCase(values.name);
    if (!name.length) return;

    if (isEdit) {
      if (name !== operation.name) {
        handlers.updateOperationName(operation.id, name);
      }
    } else {
      handlers.addOperation(module.id, name);
    }
    form.reset({ name });
  }

  // Handle form submission on blur
  const handleBlur = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form]);

  return (
    <Form {...form}>
      <form className="w-1/2">
        <FormField
          control={form.control}
          name="name"
          rules={{ required: "Operation name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="Add operation"
                  {...field}
                  onBlur={handleBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
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
