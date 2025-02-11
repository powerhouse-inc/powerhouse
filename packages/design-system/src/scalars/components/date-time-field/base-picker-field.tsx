import React, { PropsWithChildren } from "react";
import { ErrorHandling, FieldCommonProps } from "../types";
import { Input, InputProps } from "../fragments";
import { cn } from "@/scalars/lib/utils";
import { IconName } from "@/powerhouse";
import { Button } from "../fragments/button/button";
import { Popover, PopoverContent } from "../fragments/popover/popover";
import { PopoverTrigger } from "../fragments/popover/popover";
import { Icon } from "@/powerhouse";

export interface BasePickerFieldProps
  extends FieldCommonProps<string>,
    ErrorHandling {
  id?: string;
  name: string;
  disabled?: boolean;
  required?: boolean;
  iconName: IconName;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  inputProps?: Omit<
    InputProps,
    "name" | "onChange" | "value" | "defaultValue" | "onBlur"
  >;
}

export const BasePickerField = React.forwardRef<
  HTMLInputElement,
  PropsWithChildren<BasePickerFieldProps>
>(
  (
    {
      id,
      name,
      disabled,
      required,
      iconName,
      placeholder,
      children,
      value,
      defaultValue,
      isOpen,
      setIsOpen,
      onInputChange,
      handleBlur,
      inputProps,
      ...props
    },
    ref,
  ) => {
    return (
      <div className="flex flex-col space-y-2">
        <div
          className={cn(
            "flex w-[275px] rounded-md text-sm",
            "focus-within:ring-ring focus-within:ring-1 focus-within:ring-offset-0 ring-gray-900 dark:ring-charcoal-300",
            "dark:border-charcoal-700 dark:bg-charcoal-900 border border-gray-300 bg-white",
            // focus
            "focus:[&_.input-field]:bg-transparent",
            "focus-within:hover:bg-white dark:focus-within:hover:bg-charcoal-900 focus-within:hover:cursor-default",
            disabled &&
              "dark:bg-charcoal-900 dark:hover:bg-charcoal-900 cursor-not-allowed bg-white hover:bg-transparent",
          )}
        >
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                disabled={disabled}
                className={cn(
                  "w-[50px] rounded-l-md border-none pl-3 pr-2",
                  "focus:bg-none focus:text-selected-foreground",
                  "button-ghost",
                  disabled && "cursor-not-allowed  hover:bg-transparent",
                )}
                onClick={() => !disabled && setIsOpen(isOpen)}
              >
                <Icon
                  name={iconName}
                  className="size-4 hover:none text-gray-700 dark:text-gray-50"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className={cn(
                "relative w-[275px]",
                "border-gray-300 bg-white dark:bg-slate-600 dark:border-gray-900",
                "rounded-lg",
                "shadow-[0px_2px_4px_0px_rgba(0,0,0,0.08),0px_3px_10px_0px_rgba(0,0,0,0.10)]",
                "mt-[14px]",
                // custom styles
                "pt-3 pr-4 pb-6 pl-4",
                "dark:shadow-[1px_4px_15.3px_0px_#141921]",
              )}
            >
              {children}
            </PopoverContent>
          </Popover>
          <Input
            id={id}
            name={name}
            value={value}
            onChange={onInputChange}
            onBlur={handleBlur}
            defaultValue={defaultValue}
            className={cn(
              "w-full rounded-l-none border-none text-right placeholder:text-right",
              // focus
              "focus-visible:ring-0 focus-visible:ring-offset-0 focus:bg-white",
              "input-field",
            )}
            placeholder={placeholder}
            ref={ref}
            disabled={disabled}
            required={required}
            {...inputProps}
            {...props}
          />
        </div>
      </div>
    );
  },
);
