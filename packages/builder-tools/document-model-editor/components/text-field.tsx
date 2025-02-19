import {
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createNameSchema } from "../schemas/inputs.js";
import { compareStringsWithoutWhitespace } from "../utils/helpers.js";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  Form,
} from "./form.js";
import { TextareaHandle, Textarea } from "./text-area.js";

type TextFieldProps = {
  name: string;
  value: string | null | undefined;
  onSubmit: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  rows?: number;
  focusOnMount?: boolean;
  required?: boolean;
  allowEmpty?: boolean;
  unique?: string[];
  shouldReset?: boolean;
  onChange?: (value: string) => void;
};

type TextFieldHandle = {
  focus: () => void;
};

export const TextField = forwardRef<TextFieldHandle, TextFieldProps>(
  (
    {
      name,
      value,
      onSubmit,
      label,
      placeholder,
      unique,
      className = "",
      rows = 1,
      focusOnMount = false,
      required = false,
      allowEmpty = false,
      shouldReset = false,
      onChange,
    },
    ref,
  ) => {
    const textareaRef = useRef<TextareaHandle | null>(null);

    useEffect(() => {
      if (focusOnMount && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [focusOnMount]);

    const fieldSchema = z.object({
      [name]: createNameSchema({ required, allowEmpty, unique }),
    });

    type FieldValues = z.infer<typeof fieldSchema>;

    const form = useForm<FieldValues>({
      resolver: zodResolver(fieldSchema),
      defaultValues: {
        [name]: value ?? "",
      },
    });

    const handleSubmit = useCallback(
      (values: FieldValues) => {
        const newValue = values[name as keyof FieldValues];
        if (newValue === undefined || value === newValue) return;
        onSubmit(newValue);
        if (shouldReset) form.reset({ [name]: "" });
      },
      [name, value, onSubmit, form, shouldReset],
    );

    const handleBlur = useCallback(async () => {
      const currentValue = form.getValues()[name] ?? "";

      if (value === null || value === undefined) {
        if (!currentValue || currentValue.trim() === "") return;
      }

      if (compareStringsWithoutWhitespace(currentValue, value ?? "")) return;

      try {
        await form.trigger(); // Trigger validation
        if (form.formState.isValid) {
          await form.handleSubmit(handleSubmit)();
        }
      } catch (e) {
        // Allow blur to proceed even if validation fails
      }
    }, [form, handleSubmit, name, value]);

    const onEnterKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      },
      [],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        onChange?.(newValue);
      },
      [onChange],
    );

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    useEffect(() => {
      form.reset({ [name]: value ?? "" });
    }, [form, name, value]);

    return (
      <Form {...form}>
        <FormField
          control={form.control}
          name={name}
          render={({ field }) => (
            <FormItem className="grid h-full grid-rows-[auto,1fr] gap-2 overflow-visible">
              {!!label && (
                <FormLabel
                  htmlFor={name}
                  className="text-sm font-medium text-gray-700"
                >
                  {label}
                </FormLabel>
              )}
              <FormControl>
                <Textarea
                  {...field}
                  id={name}
                  ref={(node) => {
                    if (node) {
                      field.ref(node.element);
                      textareaRef.current = node;
                    }
                  }}
                  placeholder={placeholder}
                  onBlur={handleBlur}
                  onChange={(e) => {
                    field.onChange(e);
                    handleChange(e);
                  }}
                  onKeyDown={onEnterKeyDown}
                  rows={rows}
                  className={className}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    );
  },
);

TextField.displayName = "TextField";
