import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectProps } from "./types.js";

interface UseSelectProps {
  options?: SelectProps["options"];
  multiple?: boolean;
  defaultValue?: string | string[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
}

export function useSelect({
  options = [],
  multiple = false,
  defaultValue,
  value,
  onChange,
}: UseSelectProps) {
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

  // handles changes to the "multiple" prop avoiding calling onChange on mount
  const prevMultiple = useRef(multiple);
  useEffect(() => {
    if (prevMultiple.current === multiple) {
      return;
    }
    prevMultiple.current = multiple;

    if (!multiple && selectedValues.length > 1) {
      isInternalChange.current = true;
      setSelectedValues([selectedValues[0]]);
      onChange?.(selectedValues[0]);
      return;
    }
    if (selectedValues.length > 0) {
      isInternalChange.current = true;
      onChange?.(multiple ? [selectedValues[0]] : selectedValues[0]);
    }
  }, [multiple]);

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
