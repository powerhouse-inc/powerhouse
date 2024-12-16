import { useCallback, useState, useEffect, useRef } from "react";
import { SelectProps } from "@/scalars/components/enum-field/types";

interface UseSelectFieldProps {
  options?: SelectProps["options"];
  multiple?: boolean;
  searchPosition?: "Dropdown" | "Input";
  defaultValue?: string | string[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
}

export function useSelectField({
  options = [],
  multiple = false,
  searchPosition,
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
  const [searchValue, setSearchValue] = useState(() => {
    const initialValue = value ?? defaultValue ?? "";
    if (initialValue === "" || Array.isArray(initialValue)) {
      return "";
    }
    return options.find((opt) => opt.value === initialValue)?.label ?? "";
  });

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const newValue = value ?? defaultValue ?? [];
    if (newValue === "") {
      setSelectedValues([]);
      setSearchValue("");
    } else {
      setSelectedValues(Array.isArray(newValue) ? newValue : [newValue]);
    }
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
        newValues = selectedValues[0] === optionValue ? [] : [optionValue];

        if (searchPosition === "Input") {
          const selectedOptionLabel = options.find(
            (opt) => opt.value === optionValue,
          )?.label;
          setSearchValue(
            newValues.length > 0 ? (selectedOptionLabel ?? "") : "",
          );
        } else {
          setSearchValue("");
        }

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
  };
}
