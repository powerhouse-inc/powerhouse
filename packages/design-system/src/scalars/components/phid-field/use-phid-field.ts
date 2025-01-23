import { useCallback, useState, useEffect, useRef } from "react";
import type { PHIDProps, PHIDListItemProps } from "./types";
import { fetchPHIDOptions } from "./utils";

interface UsePHIDFieldProps {
  autoComplete: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: PHIDProps["onChange"];
  onBlur?: PHIDProps["onBlur"];
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

  const fetchOptions = useCallback(async () => {
    setIsLoading(true);
    setHaveFetchError(false);
    try {
      const options = await fetchPHIDOptions();
      setOptions(options);
    } catch {
      setHaveFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // TODO: Waiting for PH's feedback
  useEffect(() => {
    void fetchOptions();
  }, []);

  const [selectedValue, setSelectedValue] = useState(
    value ?? defaultValue ?? "",
  );

  useEffect(() => {
    if (autoComplete && selectedValue !== "") {
      void fetchOptions();
      setIsPopoverOpen(true);
    }
    if (!autoComplete) {
      setIsPopoverOpen(false);
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

  const handleSelectedValueChange = useCallback((value: string) => {
    setSelectedValue(value);
  }, []);

  const toggleOption = useCallback(
    (optionValue: string) => {
      isInternalChange.current = true;
      setSelectedValue(optionValue);
      setIsPopoverOpen(false);
      onChange?.(optionValue);
    },
    [selectedValue, onChange],
  );

  const handleClear = useCallback(() => {
    isInternalChange.current = true;
    setSelectedValue("");
    onChange?.("");
  }, [onChange]);

  const onTriggerBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (!isPopoverOpen) {
        onBlur?.(e);
      }
    },
    [onBlur, isPopoverOpen],
  );

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
    options,
    isLoading,
    haveFetchError,
    toggleOption,
    handleClear,
    handleOpenChange,
    handleSelectedValueChange,
    onTriggerBlur,
  };
}
