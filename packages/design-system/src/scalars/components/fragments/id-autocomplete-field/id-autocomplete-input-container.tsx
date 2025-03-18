/* eslint-disable react/jsx-no-bind */
import { Icon } from "#powerhouse";
import { cn } from "#scalars";
import { Command as CommandPrimitive } from "cmdk";
import React, { useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import {
  Tooltip,
  TooltipProvider,
} from "../../../../ui/components/tooltip/tooltip.js";
import { Input } from "../input/input.js";
import type { IdAutocompleteOption } from "./types.js";

interface IdAutocompleteInputContainerProps {
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
  selectedOption?: IdAutocompleteOption;
  optionsLength: number;
  handleOpenChange?: (open: boolean) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLInputElement>) => void;
  placeholder?: string;
  hasError: boolean;
  label: React.ReactNode;
  required?: boolean;
  isPopoverOpen: boolean;
  maxLength?: number;
  handlePaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}

export const IdAutocompleteInputContainer = React.forwardRef<
  HTMLInputElement,
  IdAutocompleteInputContainerProps
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
      selectedOption,
      optionsLength,
      handleOpenChange,
      onKeyDown,
      onMouseDown,
      placeholder,
      hasError,
      label,
      required,
      isPopoverOpen,
      maxLength,
      handlePaste,
      onPaste,
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
            className={cn("pr-9", className)}
            disabled={disabled}
            onChange={onChange}
            onBlur={onBlur}
            onClick={(e) => {
              const input = e.target as HTMLInputElement;
              if (
                !(isLoading || haveFetchError) &&
                !selectedOption &&
                input.value !== ""
              ) {
                handleOpenChange?.(true);
              }
              onClick?.(e);
            }}
            onKeyDown={(e) => {
              onKeyDown?.(e);
              const isOptionsRelatedKey = [
                "ArrowUp",
                "ArrowDown",
                "Enter",
              ].includes(e.key);

              if (e.key === "Enter" && isPopoverOpen && optionsLength === 0) {
                handleOpenChange?.(false);
                e.preventDefault();
                return;
              }
              if (
                !(isOptionsRelatedKey && isPopoverOpen && optionsLength > 0)
              ) {
                e.stopPropagation();
              }
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
            onPaste={(e) => {
              handlePaste?.(e);
              onPaste?.(e);
            }}
            placeholder={placeholder}
            aria-invalid={hasError}
            aria-label={!label ? "Id Autocomplete field" : undefined}
            aria-required={required}
            aria-expanded={isPopoverOpen}
            maxLength={maxLength}
            {...props}
            ref={ref}
          />
        </CommandPrimitive.Input>
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
                  onClick={() => {
                    navigator.clipboard
                      .writeText(selectedOption.value)
                      .then(() => {
                        setHasCopied(true);
                        setTimeout(() => setHasCopied(false), 2000);
                      })
                      .catch((error) => {
                        console.error("Failed to copy value: ", error);
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
      </div>
    );
  },
);
