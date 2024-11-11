import { useCallback, useEffect, useState } from "react";
import { SelectProps } from "@/scalars/components/types";

export const useMultiSelectField = (
  options: SelectProps["options"],
  maxSelectedOptionsToShow: number,
  defaultValue: string[],
  value?: string[],
  onChange?: (values: string[]) => void,
) => {
  const [selectedValues, setSelectedValues] = useState<string[]>(
    value ?? defaultValue,
  );
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const updateValues = useCallback(
    (newValues: string[]) => {
      setSelectedValues(newValues);
      onChange?.(newValues);
    },
    [onChange],
  );

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      setIsPopoverOpen(true);
    } else if (event.key === "Backspace" && !event.currentTarget.value) {
      const newSelectedValues = [...selectedValues];
      newSelectedValues.pop();
      updateValues(newSelectedValues);
    }
  };

  const toggleOption = (option: string) => {
    const newSelectedValues = selectedValues.includes(option)
      ? selectedValues.filter((value) => value !== option)
      : [...selectedValues, option];
    updateValues(newSelectedValues);
  };

  const handleClear = () => {
    updateValues([]);
  };

  const toggleAll = () => {
    const availableOptions = options.filter((option) => !option.disabled);
    const availableValues = availableOptions.map((option) => option.value);

    if (selectedValues.length === availableValues.length) {
      handleClear();
    } else {
      updateValues(availableValues);
    }
  };

  const handleTogglePopover = () => {
    setIsPopoverOpen((prev) => !prev);
  };

  const clearExtraOptions = () => {
    const newSelectedValues = selectedValues.slice(0, maxSelectedOptionsToShow);
    updateValues(newSelectedValues);
  };

  useEffect(() => {
    if (value !== undefined) {
      setSelectedValues(value);
    }
  }, [value]);

  return {
    selectedValues,
    isPopoverOpen,
    setIsPopoverOpen,
    handleInputKeyDown,
    toggleOption,
    handleClear,
    toggleAll,
    updateValues,
    handleTogglePopover,
    clearExtraOptions,
  };
};
