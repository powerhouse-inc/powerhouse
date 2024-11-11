import React, { useId } from "react";
import { CheckIcon, ChevronDown, XCircle, XIcon } from "lucide-react";
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
import { useMultiSelectField } from "./use-multi-select-field";

type MultiSelectBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | keyof ErrorHandling
  | keyof FieldCommonProps<string[]>
  | keyof SelectProps
  | "onChange"
>;

export interface MultiSelectProps
  extends MultiSelectBaseProps,
    ErrorHandling,
    FieldCommonProps<string[]>,
    SelectProps {
  maxSelectedOptionsToShow?: number;
  onChange?: (value: string[]) => void;
}

export const MultiSelectField = React.forwardRef<
  HTMLButtonElement,
  MultiSelectProps
>(
  (
    {
      // core functionality props
      options,
      defaultValue = [],
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
      maxSelectedOptionsToShow = 3,
      placeholder = "Select options",
      className,

      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = propId ?? `${prefix}-multi-select`;

    const {
      selectedValues,
      isPopoverOpen,
      setIsPopoverOpen,
      handleInputKeyDown,
      toggleOption,
      handleClear,
      toggleAll,
      handleTogglePopover,
      clearExtraOptions,
    } = useMultiSelectField(
      options,
      maxSelectedOptionsToShow,
      defaultValue,
      value,
      onChange,
    );

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
              aria-label={label ? undefined : "Multi select"}
              aria-required={required}
              aria-expanded={isPopoverOpen}
              className={cn(
                "flex w-full min-h-10 h-auto items-center justify-between p-1",
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
              {selectedValues.length > 0 ? (
                <div className="flex w-full items-center justify-between">
                  <div className="flex flex-wrap items-center">
                    {selectedValues
                      .slice(0, maxSelectedOptionsToShow)
                      .map((value) => {
                        const option = options.find((o) => o.value === value);
                        const IconComponent = option?.icon;
                        return (
                          <Badge
                            key={value}
                            className={cn(
                              "m-1 border-gray-200 bg-white text-gray-900",
                              "transition duration-200 ease-in-out",
                              "hover:-translate-y-0.5 hover:scale-105",
                              "hover:bg-gray-50",
                              "dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100",
                              "dark:hover:bg-gray-700",
                              "rounded-md",
                            )}
                          >
                            {IconComponent && (
                              <IconComponent className="mr-2 size-4" />
                            )}
                            {option?.label}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleOption(value);
                              }}
                              className={cn(
                                "ml-1 size-4 p-0 hover:bg-transparent",
                              )}
                            >
                              <XCircle
                                className={cn(
                                  "size-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
                                )}
                              />
                            </Button>
                          </Badge>
                        );
                      })}
                    {selectedValues.length > maxSelectedOptionsToShow && (
                      <Badge
                        className={cn(
                          "m-1",
                          "transition duration-200 ease-in-out",
                          "hover:-translate-y-0.5 hover:scale-105",
                          "bg-transparent border-gray-200 text-gray-700",
                          "hover:bg-gray-50 hover:border-gray-300",
                          "dark:border-gray-700 dark:text-gray-300",
                          "dark:hover:bg-gray-700 dark:hover:border-gray-600",
                          "rounded-md",
                        )}
                      >
                        {`+ ${selectedValues.length - maxSelectedOptionsToShow} more`}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearExtraOptions();
                          }}
                          className="ml-1 size-4 p-0 hover:bg-transparent"
                        >
                          <XCircle className="size-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" />
                        </Button>
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleClear();
                      }}
                      disabled={disabled}
                      className="size-8 p-0 hover:bg-transparent"
                    >
                      <XIcon
                        className={cn(
                          "h-4 w-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
                        )}
                      />
                    </Button>
                    <Separator
                      orientation="vertical"
                      className="flex h-full min-h-6"
                    />
                    <ChevronDown
                      className={cn(
                        "mx-2 h-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
                        "cursor-pointer",
                      )}
                    />
                  </div>
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
                  <CommandItem
                    key="all"
                    onSelect={toggleAll}
                    className={cn(
                      "cursor-pointer",
                      "hover:bg-gray-100 dark:hover:bg-gray-700",
                    )}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                        "border-gray-900 dark:border-gray-100",
                        selectedValues.length ===
                          options.filter((opt) => !opt.disabled).length
                          ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <CheckIcon className="size-4" />
                    </div>
                    <span className="text-gray-900 dark:text-gray-100">
                      {selectedValues.length ===
                      options.filter((opt) => !opt.disabled).length
                        ? "Deselect All"
                        : "Select All"}
                    </span>
                  </CommandItem>
                  {options.map((option) => {
                    const isSelected = selectedValues.includes(option.value);
                    const IconComponent = option.icon;
                    return (
                      <CommandItem
                        key={option.value}
                        onSelect={() =>
                          !option.disabled && toggleOption(option.value)
                        }
                        className={cn(
                          "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700",
                          option.disabled &&
                            "opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent",
                        )}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                            "border-gray-900 dark:border-gray-100",
                            isSelected
                              ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                              : "opacity-50 [&_svg]:invisible",
                            option.disabled && "opacity-25",
                          )}
                        >
                          <CheckIcon className="size-4" />
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
