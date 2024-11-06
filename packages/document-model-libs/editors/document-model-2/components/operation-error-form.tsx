import { Operation, OperationError } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "./form";
import { Input } from "./input";
import { useCallback } from "react";
import { Icon } from "@powerhousedao/design-system";
import { pascalCase } from "change-case";

const OperationErrorFormSchema = z.object({
  name: z.string(),
});
type Props = {
  handlers: DocumentActionHandlers;
  operation: Operation;
  error?: OperationError;
};
export function OperationErrorForm(props: Props) {
  const { operation, error, handlers } = props;
  const isEdit = !!error;

  const form = useForm<z.infer<typeof OperationErrorFormSchema>>({
    resolver: zodResolver(OperationErrorFormSchema),
    defaultValues: {
      name: error?.name ?? "",
    },
  });

  function onSubmit(values: z.infer<typeof OperationErrorFormSchema>) {
    const name = pascalCase(values.name);
    if (!name.length) return;

    if (isEdit) {
      handlers.setOperationErrorName(operation.id, error.id, name);
    } else {
      handlers.addOperationError(operation.id, name);
    }
  }

  const handleBlur = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form]);

  return (
    <Form {...form}>
      <form className="grid grid-cols-[1fr,auto] gap-1">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="Add reducer exception"
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
        {!!error && (
          <button
            type="button"
            onClick={() => handlers.deleteOperationError(error.id)}
          >
            <Icon name="Xmark" />
          </button>
        )}
      </form>
    </Form>
  );
}
