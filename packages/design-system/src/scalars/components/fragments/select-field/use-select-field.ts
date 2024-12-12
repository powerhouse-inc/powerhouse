import { useCallback, useState, useEffect, useRef } from "react";
import { SelectProps } from "@/scalars/components/enum-field/types";

interface UseSelectFieldProps {
  options?: SelectProps["options"];
  multiple?: boolean;
  defaultValue?: string | string[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
}

export function useSelectField({
  options = [],
  multiple = false,
  defaultValue,
  value,
  onChange,
}: UseSelectFieldProps) {
  const isInternalChange = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState<string[]>(() => {
    const initialValue = value ?? defaultValue ?? [];
    if (initialValue === "") {
      return [];
    }
    return Array.isArray(initialValue) ? initialValue : [initialValue];
  });
  const [searchValue, setSearchValue] = useState("");

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
    setSearchValue("");
  }, [value]);

  const handleTogglePopover = useCallback(() => {
    setIsPopoverOpen(!isPopoverOpen);
  }, [isPopoverOpen]);

  const handleSearch = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

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
        newValues = [optionValue];
        setIsPopoverOpen(false);
      }

      setSelectedValues(newValues);
      onChange?.(multiple ? newValues : newValues[0]);
    },
    [multiple, selectedValues, onChange],
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

  const selectFirstFilteredOption = useCallback(() => {
    const filteredOptions = options.filter((option) =>
      option.label.toLowerCase().includes(searchValue.toLowerCase()),
    );

    const firstOption = filteredOptions.find((opt) => !opt.disabled);
    if (firstOption) {
      toggleOption(firstOption.value);
    }
  }, [options, searchValue, toggleOption]);

  return {
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
    selectFirstFilteredOption,
  };
}
