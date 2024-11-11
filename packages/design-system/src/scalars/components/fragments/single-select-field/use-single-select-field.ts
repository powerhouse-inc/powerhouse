import { useCallback, useEffect, useState } from "react";

export const useSingleSelectField = (
  defaultValue: string,
  value?: string,
  onChange?: (value: string) => void,
) => {
  const [selectedValue, setSelectedValue] = useState<string>(
    value ?? defaultValue,
  );
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const updateValue = useCallback(
    (newValue: string) => {
      setSelectedValue(newValue);
      onChange?.(newValue);
    },
    [onChange],
  );

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      setIsPopoverOpen(true);
    } else if (event.key === "Backspace" && !event.currentTarget.value) {
      updateValue("");
    }
  };

  const handleSelect = (option: string) => {
    updateValue(option);
    setIsPopoverOpen(false);
  };

  const handleClear = () => {
    updateValue("");
  };

  const handleTogglePopover = () => {
    setIsPopoverOpen((prev) => !prev);
  };

  useEffect(() => {
    if (value !== undefined) {
      setSelectedValue(value);
    }
  }, [value]);

  return {
    selectedValue,
    isPopoverOpen,
    setIsPopoverOpen,
    handleInputKeyDown,
    handleSelect,
    handleClear,
    handleTogglePopover,
  };
};
