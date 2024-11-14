import { useCallback, useState } from "react";
import { SelectProps } from "@/scalars/components/types";

interface UseSelectFieldProps {
  options?: SelectProps["options"];
  multiple?: boolean;
  maxSelectedOptionsToShow?: number;
  defaultValue?: string | string[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
}

export function useSelectField({
  options = [],
  multiple = false,
  maxSelectedOptionsToShow = 3,
  defaultValue,
  value,
  onChange,
}: UseSelectFieldProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState<string[]>(() => {
    const initialValue = value ?? defaultValue ?? [];
    return Array.isArray(initialValue) ? initialValue : [initialValue];
  });

  const handleTogglePopover = useCallback(() => {
    setIsPopoverOpen(!isPopoverOpen);
  }, [isPopoverOpen]);

  const toggleOption = useCallback(
    (optionValue: string) => {
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
    setSelectedValues([]);
    onChange?.(multiple ? [] : "");
  }, [multiple, onChange]);

  const toggleAll = useCallback(() => {
    const enabledOptions = options
      .filter((opt) => !opt.disabled)
      .map((opt) => opt.value);

    const newValues =
      selectedValues.length === enabledOptions.length ? [] : enabledOptions;

    setSelectedValues(newValues);
    onChange?.(multiple ? newValues : newValues[0]);
  }, [options, selectedValues, multiple, onChange]);

  const clearExtraOptions = useCallback(() => {
    const newValues = selectedValues.slice(0, maxSelectedOptionsToShow);
    setSelectedValues(newValues);
    onChange?.(multiple ? newValues : newValues[0]);
  }, [selectedValues, maxSelectedOptionsToShow, multiple, onChange]);

  return {
    selectedValues,
    isPopoverOpen,
    setIsPopoverOpen,
    toggleOption,
    handleClear,
    toggleAll,
    handleTogglePopover,
    clearExtraOptions,
  };
}
