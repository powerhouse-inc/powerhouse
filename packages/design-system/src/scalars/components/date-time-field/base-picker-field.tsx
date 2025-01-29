import React, { PropsWithChildren } from "react";
import { FieldCommonProps } from "../types";
import { Input } from "../fragments";
import { cn } from "@/scalars/lib/utils";
import { IconName } from "@/powerhouse";
import { Button } from "../fragments/button/button";
import { DateFieldValue } from "../date-picker-field/types";
import { Popover, PopoverContent } from "../fragments/popover/popover";
import { PopoverTrigger } from "../fragments/popover/popover";
import { Icon } from "@/powerhouse";

export interface BasePickerFieldProps extends FieldCommonProps<DateFieldValue> {
  id?: string;
  name: string;
  disabled?: boolean;
  required?: boolean;
  iconName: IconName;
  placeholder?: string;
  value?: DateFieldValue;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
      isOpen,
      setIsOpen,
      onInputChange,
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
            // hover
            "hover:border-gray-300 hover:bg-gray-100 dark:hover:bg-charcoal-800 dark:hover:border-charcoal-700",
            "[&:hover_.input-field]:bg-transparent [&:hover_.button-ghost]:bg-transparent",
            // focus
            "focus:[&_.input-field]:bg-transparent",
            "focus-within:hover:bg-transparent focus-within:hover:cursor-default",
            disabled &&
              "bg-white cursor-not-allowed  hover:bg-transparent dark:bg-charcoal-900 dark:hover:bg-charcoal-900",
          )}
        >
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                disabled={disabled}
                className={cn(
                  "w-[50px] rounded-l-md border-none px-2",
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
                "border-gray-300 bg-white dark:border-slate-500 dark:bg-slate-700",
                "rounded shadow-[1px_4px_15px_0px_rgba(74,88,115,0.25)] dark:shadow-[1px_4px_15.3px_0px_#141921]",
                "mt-[14px]",
              )}
            >
              {children}
            </PopoverContent>
          </Popover>
          <Input
            id={id}
            name={name}
            value={
              value && typeof value === "string"
                ? value
                : typeof value === "object"
                  ? value?.toISOString()
                  : ""
            }
            onChange={onInputChange}
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
          />
        </div>
      </div>
    );
  },
);
