import { useCallback, useState, useEffect, useRef } from "react";
import type { PHIDProps } from "./types";

interface UsePHIDFieldProps {
  onChange?: PHIDProps["onChange"];
  onBlur?: PHIDProps["onBlur"];
  defaultValue?: string;
  value?: string;
}

export function usePHIDField({
  onChange,
  onBlur,
  defaultValue,
  value,
}: UsePHIDFieldProps) {
  const isInternalChange = useRef(false);
  const commandListRef = useRef<HTMLDivElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState<string>(
    value ?? defaultValue ?? "",
  );

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setSelectedValue(value ?? defaultValue ?? "");
  }, [value]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsPopoverOpen(open);
  }, []);

  const handleSelectedValueChange = useCallback((value: string) => {
    setSelectedValue(value);
  }, []);

  const toggleOption = useCallback(
    (optionValue: string) => {
      isInternalChange.current = true;
      const newValue = selectedValue === optionValue ? "" : optionValue;
      setSelectedValue(newValue);
      setIsPopoverOpen(false);
      onChange?.(newValue);
    },
    [selectedValue, onChange],
  );

  const handleClear = useCallback(() => {
    isInternalChange.current = true;
    setSelectedValue("");
    onChange?.("");
  }, [onChange]);

  const [haveBeenOpened, setHaveBeenOpened] = useState<boolean>(false);
  useEffect(() => {
    if (!isPopoverOpen && haveBeenOpened) {
      onBlur?.({ target: {} } as React.FocusEvent<HTMLInputElement>);
    }

    if (isPopoverOpen) {
      setHaveBeenOpened(true);
    }
  }, [isPopoverOpen, haveBeenOpened, onBlur]);

  return {
    selectedValue,
    isPopoverOpen,
    commandListRef,
    toggleOption,
    handleClear,
    handleOpenChange,
    handleSelectedValueChange,
  };
}
