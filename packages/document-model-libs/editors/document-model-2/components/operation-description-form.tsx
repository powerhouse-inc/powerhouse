import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormField, FormItem, FormControl, FormMessage } from "./form";
import { Textarea } from "./text-area";
import { Operation } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";

type Props = {
  operation: Operation;
  handlers: DocumentActionHandlers;
};
export function OperationDescriptionForm(props: Props) {
  const { operation, handlers } = props;

  const descriptionFormSchema = z.object({
    description: z.string(),
  });

  type DescriptionFormSchema = z.infer<typeof descriptionFormSchema>;

  const form = useForm<DescriptionFormSchema>({
    resolver: zodResolver(descriptionFormSchema),
    defaultValues: {
      description: operation.description ?? "",
    },
  });

  const { control, handleSubmit } = form;

  function onSubmit({ description: newDescription }: DescriptionFormSchema) {
    handlers.setOperationDescription(operation.id, newDescription);
  }

  const handleBlur = useCallback(() => {
    form.handleSubmit(onSubmit)();
  }, [form]);

  const onEnterKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLTextAreaElement).blur();
      }
    },
    [],
  );

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="Operation Description"
                  {...field}
                  onBlur={handleBlur}
                  onKeyDown={onEnterKeyDown}
                  rows={2}
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
