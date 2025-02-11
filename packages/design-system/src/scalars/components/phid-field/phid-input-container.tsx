import React, { useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { useMediaQuery } from "usehooks-ts";
import { Icon } from "@/powerhouse/components/icon";
import { Input } from "@/scalars/components/fragments/input";
import {
  Tooltip,
  TooltipProvider,
} from "@/scalars/components/fragments/tooltip";
import { cn } from "@/scalars/lib/utils";
import type { PHIDListItemProps } from "./types";

interface PHIDInputContainerProps {
  id: string;
  name: string;
  value: string;
  className?: string;
  isLoading: boolean;
  haveFetchError: boolean;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
  options: PHIDListItemProps[];
  selectedOption?: PHIDListItemProps;
  handleOpenChange: (open: boolean) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLInputElement>) => void;
  placeholder?: string;
  hasError: boolean;
  label: React.ReactNode;
  required?: boolean;
  isPopoverOpen: boolean;
  maxLength?: number;
  autoComplete: boolean;
}

export const PHIDInputContainer = React.forwardRef<
  HTMLInputElement,
  PHIDInputContainerProps
>(
  (
    {
      id,
      name,
      value,
      className,
      isLoading,
      haveFetchError,
      disabled,
      onChange,
      onBlur,
      onClick,
      options,
      selectedOption,
      handleOpenChange,
      onMouseDown,
      placeholder,
      hasError,
      label,
      required,
      isPopoverOpen,
      maxLength,
      autoComplete,
      ...props
    },
    ref,
  ) => {
    const [hasCopied, setHasCopied] = useState(false);
    const hasHover = useMediaQuery("(hover: hover) and (pointer: fine)");

    return (
      <div className={cn("group relative")}>
        <CommandPrimitive.Input asChild>
          <Input
            id={id}
            name={name}
            value={value}
            className={cn(autoComplete && "pr-9", className)}
            disabled={disabled}
            onChange={onChange}
            onBlur={onBlur}
            onClick={(e) => {
              const input = e.target as HTMLInputElement;
              if (
                autoComplete &&
                !((isLoading || haveFetchError) && options.length === 0) &&
                !selectedOption &&
                input.value !== ""
              ) {
                handleOpenChange(true);
              }
              onClick?.(e);
            }}
            onMouseDown={(e) => {
              const input = e.target as HTMLInputElement;
              if (!input.contains(document.activeElement)) {
                // wait for the next tick to ensure the focus occurs first
                requestAnimationFrame(() => {
                  input.select();
                });
              }
              onMouseDown?.(e);
            }}
            placeholder={placeholder}
            aria-invalid={hasError}
            aria-label={!label ? "PHID field" : undefined}
            aria-required={required}
            aria-expanded={isPopoverOpen}
            maxLength={maxLength}
            {...props}
            ref={ref}
          />
        </CommandPrimitive.Input>
        {autoComplete && (
          <div
            className={cn(
              "absolute right-3 top-1/2 flex size-4 -translate-y-1/2 items-center",
              !isLoading &&
                !haveFetchError &&
                !selectedOption &&
                "pointer-events-none",
            )}
          >
            {isLoading && (
              <Icon
                name="Reload"
                size={16}
                className={cn("animate-spin text-gray-500 dark:text-gray-600")}
              />
            )}
            {haveFetchError && (
              <TooltipProvider>
                <Tooltip content="Network error!">
                  <Icon name="Error" size={16} className={cn("text-red-900")} />
                </Tooltip>
              </TooltipProvider>
            )}
            {selectedOption && !isLoading && !haveFetchError && (
              <TooltipProvider>
                <Tooltip content="Copied!" open={hasCopied} triggerAsChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      navigator.clipboard
                        .writeText(selectedOption.phid)
                        .then(() => {
                          setHasCopied(true);
                          setTimeout(() => setHasCopied(false), 2000);
                        })
                        .catch((error) => {
                          console.error("Failed to copy PHID: ", error);
                        });
                    }}
                    className={cn(
                      "focus-visible:outline-none [&_svg]:pointer-events-none",
                      hasHover &&
                        "opacity-0 transition-opacity duration-500 group-hover:opacity-100",
                    )}
                  >
                    <Icon
                      name="Copy"
                      size={16}
                      className={cn("text-gray-500 dark:text-gray-600")}
                    />
                  </button>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>
    );
  },
);
