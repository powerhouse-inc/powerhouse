import React, { useId } from "react";
import { CheckIcon, ChevronDown, XIcon } from "lucide-react";
import { Badge } from "@/scalars/components/fragments/chadcn-ui/badge";
import { Button } from "@/scalars/components/fragments/chadcn-ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/scalars/components/fragments/chadcn-ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/scalars/components/fragments/chadcn-ui/popover";
import { Separator } from "@/scalars/components/fragments/chadcn-ui/separator";
import { FormGroup } from "@/scalars/components/fragments/form-group";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormDescription } from "@/scalars/components/fragments/form-description";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { cn } from "@/scalars/lib/utils";
import {
  ErrorHandling,
  FieldCommonProps,
  SelectProps,
} from "@/scalars/components/types";
import { useSingleSelectField } from "./use-single-select-field";

type SingleSelectBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | keyof ErrorHandling
  | keyof FieldCommonProps<string>
  | keyof SelectProps
  | "onChange"
>;

export interface SingleSelectProps
  extends SingleSelectBaseProps,
    ErrorHandling,
    FieldCommonProps<string>,
    SelectProps {
  onChange?: (value: string) => void;
}

export const SingleSelectField = React.forwardRef<
  HTMLButtonElement,
  SingleSelectProps
>(
  (
    {
      // core functionality props
      options,
      defaultValue = "",
      value,
      onChange,

      // form-related props
      autoFocus = false,
      id: propId,
      name,
      label,
      required = false,
      disabled = false,

      // validation props
      customValidator,
      errors = [],
      warnings = [],
      showErrorOnBlur = false,
      showErrorOnChange = false,

      // behavior props
      asChild = false,
      asModal = false,
      searchable = false,

      // display props
      description,
      placeholder = "Select an option",
      className,

      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = propId ?? `${prefix}-single-select`;

    const {
      selectedValue,
      isPopoverOpen,
      setIsPopoverOpen,
      handleInputKeyDown,
      handleSelect,
      handleClear,
      handleTogglePopover,
    } = useSingleSelectField(defaultValue, value, onChange);

    const selectedOption = options.find((o) => o.value === selectedValue);
    const IconComponent = selectedOption?.icon;

    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            required={required}
            disabled={disabled}
            hasError={errors.length > 0}
            className="mb-1.5"
          >
            {label}
          </FormLabel>
        )}
        <Popover
          open={isPopoverOpen}
          onOpenChange={setIsPopoverOpen}
          modal={asModal}
        >
          <PopoverTrigger asChild={asChild} disabled={disabled}>
            <Button
              ref={ref}
              id={id}
              name={name}
              role="combobox"
              autoFocus={autoFocus}
              onClick={handleTogglePopover}
              disabled={disabled}
              aria-invalid={errors.length > 0}
              aria-label={label ? undefined : "Single select"}
              aria-required={required}
              aria-expanded={isPopoverOpen}
              className={cn(
                "flex w-full min-h-10 h-auto items-center justify-between p-1",
                "min-w-[200px]",
                "rounded-md border border-gray-200 bg-white",
                "hover:bg-gray-50 hover:border-gray-300",
                "dark:border-gray-700 dark:bg-gray-800",
                "dark:hover:bg-gray-700 dark:hover:border-gray-600",
                "focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1",
                "dark:focus:ring-gray-400 dark:focus:ring-offset-gray-900",
                disabled && [
                  "opacity-50",
                  "cursor-not-allowed",
                  "hover:bg-white dark:hover:bg-gray-800",
                ],
                className,
              )}
              {...props}
            >
              {selectedValue ? (
                <div className="flex w-full items-center justify-between">
                  <div className="flex flex-1 items-center gap-2 px-2">
                    {IconComponent && (
                      <IconComponent className="size-4 text-gray-500 dark:text-gray-400" />
                    )}
                    <span className="text-gray-900 dark:text-gray-100">
                      {selectedOption?.label}
                    </span>
                  </div>
                  <ChevronDown className="mx-2 h-4 cursor-pointer text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" />
                </div>
              ) : (
                <div className="mx-auto flex w-full items-center justify-between">
                  <span className="mx-3 text-sm text-gray-500 dark:text-gray-400">
                    {placeholder}
                  </span>
                  <ChevronDown className="mx-2 h-4 cursor-pointer text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" />
                </div>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            onEscapeKeyDown={() => setIsPopoverOpen(false)}
            className="w-[--radix-popover-trigger-width] p-0"
          >
            <Command className="border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              {searchable && (
                <CommandInput
                  placeholder="Search..."
                  onKeyDown={handleInputKeyDown}
                  className={cn(
                    "text-gray-900",
                    "placeholder:text-gray-500",
                    "dark:text-gray-100",
                    "dark:placeholder:text-gray-400",
                  )}
                />
              )}
              <CommandList>
                <CommandEmpty className="text-gray-500 dark:text-gray-400">
                  No results found.
                </CommandEmpty>
                <CommandGroup>
                  {options.map((option) => {
                    const isSelected = selectedValue === option.value;
                    const IconComponent = option.icon;
                    return (
                      <CommandItem
                        key={option.value}
                        onSelect={() =>
                          !option.disabled && handleSelect(option.value)
                        }
                        className={cn(
                          "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700",
                          option.disabled &&
                            "opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent",
                        )}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-full border",
                            isSelected
                              ? "border-gray-900 dark:border-gray-100"
                              : "border-gray-400 dark:border-gray-600",
                            "bg-white dark:bg-gray-800",
                            option.disabled && "opacity-25",
                          )}
                        >
                          {isSelected && (
                            <div className="size-2 rounded-full bg-gray-900 dark:bg-gray-100" />
                          )}
                        </div>
                        {IconComponent && (
                          <IconComponent
                            className={cn(
                              "mr-2 size-4 text-gray-500 dark:text-gray-400",
                              option.disabled && "opacity-50",
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            "text-gray-900 dark:text-gray-100",
                            option.disabled &&
                              "text-gray-400 dark:text-gray-600",
                          )}
                        >
                          {option.label}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {description && (
          <FormDescription className="mt-1.5 dark:text-gray-400">
            {description}
          </FormDescription>
        )}
        {warnings.length > 0 && (
          <FormMessageList
            messages={warnings}
            type="warning"
            className="mt-1.5"
          />
        )}
        {errors.length > 0 && (
          <FormMessageList messages={errors} type="error" className="mt-1.5" />
        )}
      </FormGroup>
    );
  },
);
