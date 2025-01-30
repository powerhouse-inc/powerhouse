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
  const abortControllerRef = useRef<AbortController | null>(null);
  const commandListRef = useRef<HTMLDivElement>(null);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [options, setOptions] = useState<PHIDListItemProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [haveFetchError, setHaveFetchError] = useState(false);
  const [selectedValue, setSelectedValue] = useState(
    value ?? defaultValue ?? "",
  );
  const [commandValue, setCommandValue] = useState("");
  const [haveBeenOpened, setHaveBeenOpened] = useState(false);

  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setHaveFetchError(false);
    setIsLoading(false);
    setIsPopoverOpen(false);
    setOptions([]);
  }, []);

  const fetchOptions = useCallback(
    async (newValue: string) => {
      if (newValue === "") {
        clear();
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setHaveFetchError(false);
      setIsLoading(true);

      try {
        // Simulate 30% chance of error
        if (Math.random() < 0.3) {
          throw new Error("Simulated error");
        }

        const newOptions = await fetchPHIDOptions({
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setOptions(newOptions);
          const hasMatch = newOptions.some((opt) => opt.phid === newValue);
          setIsPopoverOpen(!hasMatch);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        if (!controller.signal.aborted) {
          setHaveFetchError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [clear],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setCommandValue(options[0]?.phid ?? "");
      }
      setIsPopoverOpen(open);
    },
    [options],
  );

  const toggleOption = useCallback(
    (optionValue: string) => {
      isInternalChange.current = true;
      setSelectedValue(optionValue);
      setIsPopoverOpen(false);
      onChange?.(optionValue);
    },
    [onChange],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setSelectedValue(newValue);

      if (autoComplete) {
        void fetchOptions(newValue);
      } else {
        clear();
      }

      onChange?.(newValue);
    },
    [autoComplete, onChange, fetchOptions, clear],
  );

  const handleCommandValue = useCallback((value: string) => {
    setCommandValue(value);
  }, []);

  const onTriggerBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (!isPopoverOpen) {
        onBlur?.(e);
      }
    },
    [onBlur, isPopoverOpen],
  );

  useEffect(() => {
    if (autoComplete && selectedValue !== "") {
      void fetchOptions(selectedValue);
    }
    if (!autoComplete) {
      clear();
    }
  }, [autoComplete, selectedValue, fetchOptions, clear]);

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setSelectedValue(value ?? defaultValue ?? "");
  }, [value, defaultValue]);

  useEffect(() => {
    if (!isPopoverOpen && haveBeenOpened) {
      onBlur?.({ target: {} } as React.FocusEvent<HTMLInputElement>);
    }

    if (isPopoverOpen) {
      setHaveBeenOpened(true);
    }
  }, [isPopoverOpen, haveBeenOpened, onBlur]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    selectedValue,
    isPopoverOpen,
    commandListRef,
    options,
    isLoading,
    haveFetchError,
    commandValue,
    toggleOption,
    handleOpenChange,
    onTriggerBlur,
    handleChange,
    handleCommandValue,
  };
}
