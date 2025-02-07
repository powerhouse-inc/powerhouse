import { useCallback, useState, useEffect, useRef } from "react";
import { SelectProps } from "@/scalars/components/enum-field/types";
import { SelectFieldProps } from "./select-field";

interface UseSelectFieldProps {
  options?: SelectProps["options"];
  multiple?: boolean;
  defaultValue?: string | string[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  onBlur?: SelectFieldProps["onBlur"];
}

export function useSelectField({
  options = [],
  multiple = false,
  defaultValue,
  value,
  onChange,
  onBlur,
}: UseSelectFieldProps) {
  const isInternalChange = useRef(false);
  const commandListRef = useRef<HTMLDivElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState<string[]>(() => {
    const initialValue = value ?? defaultValue ?? [];
    if (initialValue === "") {
      return [];
    }
    return Array.isArray(initialValue) ? initialValue : [initialValue];
  });

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const newValue = value ?? defaultValue ?? [];
    if (newValue === "") {
      setSelectedValues([]);
    } else {
      setSelectedValues(Array.isArray(newValue) ? newValue : [newValue]);
    }
  }, [value]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsPopoverOpen(open);
  }, []);

  const toggleOption = useCallback(
    (optionValue: string) => {
      isInternalChange.current = true;
      let newValues: string[];

      if (multiple) {
        newValues = selectedValues.includes(optionValue)
          ? selectedValues.filter((v) => v !== optionValue)
          : [...selectedValues, optionValue];
      } else {
        newValues = selectedValues[0] === optionValue ? [] : [optionValue];

        setIsPopoverOpen(false);
      }

      setSelectedValues(newValues);
      onChange?.(multiple ? newValues : (newValues[0] ?? ""));
    },
    [multiple, selectedValues, options, onChange],
  );

  const handleClear = useCallback(() => {
    isInternalChange.current = true;
    setSelectedValues([]);
    onChange?.(multiple ? [] : "");
  }, [multiple, onChange]);

  const toggleAll = useCallback(() => {
    isInternalChange.current = true;
    const enabledOptions = options
      .filter((opt) => !opt.disabled)
      .map((opt) => opt.value);

    const newValues =
      selectedValues.length === enabledOptions.length ? [] : enabledOptions;

    setSelectedValues(newValues);
    onChange?.(multiple ? newValues : newValues[0]);
  }, [options, selectedValues, multiple, onChange]);

  // call onBlur when the popover is closed to invoke the validation
  const [haveBeenOpened, setHaveBeenOpened] = useState<boolean>(false);
  useEffect(() => {
    if (!isPopoverOpen && haveBeenOpened) {
      onBlur?.({ target: {} } as React.FocusEvent<HTMLButtonElement>);
    }

    if (isPopoverOpen) {
      setHaveBeenOpened(true);
    }
  }, [isPopoverOpen, haveBeenOpened, onBlur]);

  return {
    selectedValues,
    isPopoverOpen,
    commandListRef,
    toggleOption,
    handleClear,
    toggleAll,
    handleOpenChange,
  };
}
