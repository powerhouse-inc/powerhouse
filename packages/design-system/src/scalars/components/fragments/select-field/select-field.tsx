/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable react/jsx-no-bind */
/* eslint-disable react/jsx-max-depth */
import React, { useId, useMemo, useEffect } from "react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/scalars/components/fragments/command";
import { useCommandState } from "cmdk";
import { Icon, type IconName } from "@/powerhouse/components/icon";
import { Button } from "@/scalars/components/fragments/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/scalars/components/fragments/popover";
import { FormGroup } from "@/scalars/components/fragments/form-group";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormDescription } from "@/scalars/components/fragments/form-description";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import { cn } from "@/scalars/lib/utils";
import { FieldCommonProps, ErrorHandling } from "@/scalars/components/types";
import { SelectProps } from "@/scalars/components/enum-field/types";
import { useSelectField } from "./use-select-field";
import { SelectedContent } from "./selected-content";

type SelectFieldBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement> &
    React.HTMLAttributes<HTMLDivElement>,
  | keyof FieldCommonProps<string | string[]>
  | keyof ErrorHandling
  | keyof SelectProps
>;

export interface SelectFieldProps
  extends SelectFieldBaseProps,
    FieldCommonProps<string | string[]>,
    ErrorHandling,
    SelectProps {}

export const SelectFieldRaw = React.forwardRef<
  HTMLButtonElement | HTMLDivElement,
  SelectFieldProps
>(
  (
    {
      // core functionality props
      options = [],
      optionsCheckmark = "Auto",
      multiple,
      defaultValue,
      value,
      onChange,

      // form-related props
      id: propId,
      name,
      label,
      required,
      disabled,

      // validation props
      errors = [],
      warnings = [],

      // behavior props
      searchable,
      searchPosition = "Dropdown",

      // display props
      description,
      maxSelectedOptionsToShow = 3,
      placeholder,
      className,

      ...props
    },
    ref,
  ) => {
    // If not valid configuration, fallback to 'Dropdown'
    if (searchPosition === "Input" && multiple) {
      searchPosition = "Dropdown";
    }

    const prefix = useId();
    const id = propId ?? `${prefix}-select`;

    const {
      selectedValues,
      isPopoverOpen,
      searchValue,
      searchInputRef,
      setIsPopoverOpen,
      toggleOption,
      handleClear,
      toggleAll,
      handleTogglePopover,
      handleSearch,
      handleOpenChange,
    } = useSelectField({
      options,
      multiple,
      searchPosition,
      defaultValue,
      value,
      onChange,
    });

    const enabledOptions = options.filter((opt) => !opt.disabled);

    const renderIcon = (
      IconComponent:
        | IconName
        | React.ComponentType<{ className?: string }>
        | undefined,
      disabled?: boolean,
    ) => {
      if (typeof IconComponent === "string") {
        return (
          <Icon
            name={IconComponent}
            size={16}
            className={cn(
              "text-gray-700 dark:text-gray-400",
              disabled && "opacity-50",
            )}
          />
        );
      }
      return (
        IconComponent && (
          <IconComponent
            className={cn(
              "size-4",
              "text-gray-700 dark:text-gray-400",
              disabled && "opacity-50",
            )}
          />
        )
      );
    };

    const Content = () => {
      const search = useCommandState((state) => state.search) as string;

      const sortedOptions = useMemo(() => {
        if (searchable && searchPosition === "Input" && search === "") {
          return [...options].sort((a, b) =>
            a.label > b.label ? 1 : a.label < b.label ? -1 : 0,
          );
        }
        return options;
      }, [search]);

      // Scroll to top when search change
      useEffect(() => {
        const commandList = document.querySelector(".select-command-list");
        if (commandList) {
          commandList.scrollTop = 0;
        }
      }, [search]);

      return (
        <>
          {searchable && searchPosition === "Dropdown" && (
            <CommandInput
              placeholder="Search..."
              className={cn("text-gray-900 dark:text-gray-50")}
              autoFocus
            />
          )}
          <CommandList className="select-command-list">
            <CommandEmpty className="p-4 text-center text-[14px] font-normal leading-5 text-gray-700 dark:text-gray-400">
              No results found.
            </CommandEmpty>
            {multiple && search === "" && (
              <CommandGroup className="pb-0">
                <CommandItem
                  value="select-all"
                  onSelect={toggleAll}
                  disabled={false}
                  className={cn(
                    "cursor-pointer",
                    "hover:not([data-highlighted]):bg-gray-100 dark:hover:not([data-highlighted]):bg-gray-900",
                    "data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-900",
                    "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-900",
                  )}
                  role="option"
                  aria-selected={
                    selectedValues.length === enabledOptions.length
                  }
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded border",
                        "border-gray-700 dark:border-gray-400",
                        selectedValues.length === enabledOptions.length
                          ? "bg-gray-900 text-slate-50 dark:bg-gray-400 dark:text-black"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Icon name="Checkmark" size={16} />
                    </div>
                    <span className="text-[14px] font-semibold leading-4 text-gray-900 dark:text-gray-50">
                      {selectedValues.length === enabledOptions.length
                        ? "Deselect All"
                        : "Select All"}
                    </span>
                  </div>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup
              className={multiple && search === "" ? "pt-0" : undefined}
            >
              {sortedOptions.map((option) => {
                const isSelected = selectedValues.includes(option.value);

                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() =>
                      !option.disabled && toggleOption(option.value)
                    }
                    disabled={option.disabled}
                    className={cn(
                      "cursor-pointer",
                      "hover:not([data-highlighted]):bg-gray-100 dark:hover:not([data-highlighted]):bg-gray-900",
                      "data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-900",
                      "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-900",
                      option.disabled &&
                        "cursor-not-allowed opacity-75 hover:bg-transparent dark:hover:bg-transparent",
                      optionsCheckmark === "None" &&
                        isSelected &&
                        "!bg-gray-300 dark:!bg-gray-700",
                    )}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {optionsCheckmark === "Auto" &&
                      (multiple ? (
                        <div
                          className={cn(
                            "flex size-4 items-center justify-center rounded border",
                            "border-gray-700 dark:border-gray-400",
                            isSelected
                              ? "bg-gray-900 text-slate-50 dark:bg-gray-400 dark:text-black"
                              : "opacity-50 [&_svg]:invisible",
                            option.disabled && "opacity-75",
                          )}
                        >
                          <Icon name="Checkmark" size={16} />
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "relative size-4 rounded-full border",
                            isSelected
                              ? "border-gray-900 dark:border-gray-400"
                              : "border-gray-800 dark:border-gray-400",
                            "bg-transparent dark:bg-transparent",
                            option.disabled && "opacity-75",
                          )}
                        >
                          {isSelected && (
                            <div className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-900 dark:bg-gray-400" />
                          )}
                        </div>
                      ))}
                    {renderIcon(option.icon, option.disabled)}
                    <span
                      className={cn(
                        "flex-1 truncate text-[14px] font-medium leading-4",
                        "text-gray-700 dark:text-gray-400",
                        option.disabled && "text-gray-600 dark:text-gray-600",
                      )}
                    >
                      {option.label}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </>
      );
    };

    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={searchable && searchPosition === "Input" ? undefined : id}
            required={required}
            disabled={disabled}
            hasError={errors.length > 0}
            inline={false}
            onClick={() => {
              if (searchable && searchPosition === "Input") {
                searchInputRef.current?.focus();
                setIsPopoverOpen(true);
              }
            }}
          >
            {label}
          </FormLabel>
        )}
        <Popover open={isPopoverOpen} onOpenChange={handleOpenChange}>
          <Command className="relative">
            <PopoverTrigger asChild={true}>
              {searchable && searchPosition === "Input" ? (
                // a div don´t have type="button" but PopoverTrigger expect a button
                // we need to use PopoverAnchor but it requires some extra work
                // @ts-expect-error - description above
                <div ref={ref as React.Ref<HTMLDivElement>} type={undefined}>
                  <CommandInput
                    ref={searchInputRef}
                    value={searchValue}
                    onValueChange={handleSearch}
                    placeholder={placeholder}
                    onKeyDown={(e) => {
                      if (!isPopoverOpen && e.key !== "Escape") {
                        setIsPopoverOpen(true);
                      }
                    }}
                    wrapperClassName={cn("mt-0 border-0 border-none")}
                    className={cn("pr-8", className)}
                    disabled={disabled}
                    aria-invalid={errors.length > 0}
                    aria-required={required}
                    aria-expanded={isPopoverOpen}
                    {...props}
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    <Icon
                      name="ChevronDown"
                      size={16}
                      className="text-gray-700 dark:text-gray-400"
                    />
                  </div>
                </div>
              ) : (
                <Button
                  id={id}
                  name={name}
                  type="button"
                  role="combobox"
                  onClick={handleTogglePopover}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setIsPopoverOpen(true);
                    }
                  }}
                  disabled={disabled}
                  aria-invalid={errors.length > 0}
                  aria-label={
                    label ? undefined : multiple ? "Multi select" : "Select"
                  }
                  aria-required={required}
                  aria-expanded={isPopoverOpen}
                  className={cn(
                    "flex size-full items-center justify-between px-3 py-[7.2px]",
                    "dark:border-charcoal-700 dark:bg-charcoal-900 rounded-md border border-gray-300 bg-white",
                    "hover:border-gray-300 hover:bg-gray-100",
                    "dark:hover:border-charcoal-700 dark:hover:bg-charcoal-800",
                    "dark:focus:ring-charcoal-300 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:ring-offset-0",
                    "dark:focus-visible:ring-charcoal-300 focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0",
                    disabled && [
                      "!pointer-events-auto cursor-not-allowed",
                      "dark:hover:border-charcoal-700 dark:hover:bg-charcoal-900 hover:border-gray-300 hover:bg-white",
                    ],
                    className,
                  )}
                  {...props}
                  ref={ref as React.Ref<HTMLButtonElement>}
                >
                  <SelectedContent
                    selectedValues={selectedValues}
                    options={options}
                    multiple={multiple}
                    searchable={searchable}
                    maxSelectedOptionsToShow={maxSelectedOptionsToShow}
                    placeholder={placeholder}
                    handleClear={handleClear}
                  />
                </Button>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="start"
              onOpenAutoFocus={(e) => {
                if (searchable && searchPosition === "Input") {
                  if (
                    searchInputRef.current &&
                    searchInputRef.current !== document.activeElement
                  ) {
                    searchInputRef.current.focus();
                  }
                  e.preventDefault();
                }
              }}
              className={cn(
                "w-[--radix-popover-trigger-width] p-0",
                "border-gray-300 bg-white dark:border-slate-500 dark:bg-slate-600",
                "rounded shadow-[1px_4px_15px_0px_rgba(74,88,115,0.25)] dark:shadow-[1px_4px_15.3px_0px_#141921]",
              )}
            >
              <Content />
            </PopoverContent>
          </Command>
        </Popover>
        {description && <FormDescription>{description}</FormDescription>}
        {warnings.length > 0 && (
          <FormMessageList messages={warnings} type="warning" />
        )}
        {errors.length > 0 && (
          <FormMessageList messages={errors} type="error" />
        )}
      </FormGroup>
    );
  },
);

export const SelectField = withFieldValidation<SelectFieldProps>(
  SelectFieldRaw,
) as React.ForwardRefExoticComponent<
  SelectFieldProps & React.RefAttributes<HTMLButtonElement | HTMLDivElement>
>;

SelectField.displayName = "SelectField";
