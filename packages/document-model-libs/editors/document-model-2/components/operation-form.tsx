import { Module, Operation } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { toConstantCase } from "../schemas";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "./form";
import { Input } from "./input";
import { useCallback, useEffect, useRef } from "react";
import { Icon } from "@powerhousedao/design-system";

const OperationFormSchema = z.object({
  name: z.string(),
});
type Props = {
  handlers: DocumentActionHandlers;
  module: Module;
  operation?: Operation;
  autoFocus?: boolean;
};
export function OperationForm(props: Props) {
  const { operation, module, handlers, autoFocus } = props;
  const isEdit = !!operation;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [autoFocus]);

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
      handlers.addOperationAndInitialSchema(module.id, name);
      form.reset({ name: "" });
    }
  }

  const handleBlur = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form]);

  return (
    <Form {...form}>
      <form className="grid h-fit grid-cols-[1fr,auto] gap-1">
        <FormField
          control={form.control}
          name="name"
          rules={{ required: "Operation name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  ref={(e) => {
                    if (e) {
                      field.ref(e);
                      inputRef.current = e;
                    }
                  }}
                  placeholder="Add operation"
                  onBlur={handleBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {!!operation && (
          <button
            tabIndex={-1}
            type="button"
            onClick={() => handlers.deleteOperation(operation.id)}
          >
            <Icon name="Xmark" />
          </button>
        )}
      </form>
    </Form>
  );
}
