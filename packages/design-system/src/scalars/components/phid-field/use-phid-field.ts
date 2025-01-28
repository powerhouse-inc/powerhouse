import React, { useCallback, useState, useEffect, useRef } from "react";
import type { PHIDProps, PHIDListItemProps } from "./types";
import { fetchPHIDOptions } from "./utils";

interface UsePHIDFieldProps {
  autoComplete: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: PHIDProps["onChange"];
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

export function usePHIDField({
  autoComplete,
  defaultValue,
  value,
  onChange,
  onBlur,
}: UsePHIDFieldProps) {
  const isInternalChange = useRef(false);
  const commandListRef = useRef<HTMLDivElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [options, setOptions] = useState<PHIDListItemProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [haveFetchError, setHaveFetchError] = useState(false);
  const [selectedValue, setSelectedValue] = useState(
    value ?? defaultValue ?? "",
  );

  const fetchOptions = useCallback(async (newValue: string) => {
    setOptions([]);
    setHaveFetchError(false);
    setIsLoading(true);
    try {
      // Simulate 33% chance of error
      if (Math.random() < 0.33) {
        throw new Error("Simulated error");
      }
      const newOptions = await fetchPHIDOptions();
      setOptions(newOptions);

      if (newValue !== "") {
        const hasMatch = newOptions.some((opt) => opt.phid === newValue);
        setIsPopoverOpen(!hasMatch);
      }
    } catch {
      setHaveFetchError(true);
      setIsPopoverOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoComplete && selectedValue !== "") {
      void fetchOptions(selectedValue);
    }
    if (!autoComplete) {
      setIsPopoverOpen(false);
      setOptions([]);
    }
  }, [autoComplete]);

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

  const toggleOption = useCallback(
    (optionValue: string) => {
      isInternalChange.current = true;
      setSelectedValue(optionValue);
      setIsPopoverOpen(false);
      onChange?.(optionValue);
    },
    [onChange],
  );

  const onTriggerBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (!isPopoverOpen) {
        onBlur?.(e);
      }
    },
    [onBlur, isPopoverOpen],
  );

  const [haveBeenOpened, setHaveBeenOpened] = useState(false);
  useEffect(() => {
    if (!isPopoverOpen && haveBeenOpened) {
      onBlur?.({ target: {} } as React.FocusEvent<HTMLInputElement>);
    }

    if (isPopoverOpen) {
      setHaveBeenOpened(true);
    }
  }, [isPopoverOpen, haveBeenOpened, onBlur]);

  // TODO: Debounce
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      console.log("handleChange", e.target.value);
      const newValue = e.target.value;
      setSelectedValue(newValue);

      if (autoComplete && newValue !== "") {
        void fetchOptions(newValue);
      } else {
        setIsPopoverOpen(false);
      }

      onChange?.(newValue);
    },
    [autoComplete, onChange],
  );

  return {
    selectedValue,
    isPopoverOpen,
    commandListRef,
    options,
    isLoading,
    haveFetchError,
    toggleOption,
    handleOpenChange,
    onTriggerBlur,
    handleChange,
  };
}
