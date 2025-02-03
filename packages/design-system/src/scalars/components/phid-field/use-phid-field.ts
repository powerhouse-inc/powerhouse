import React, { useCallback, useState, useEffect, useRef } from "react";
import { useDebounceCallback } from "usehooks-ts";
import type { PHIDProps, PHIDListItemProps } from "./types";
import { fetchPHIDOptions, fetchSelectedOption } from "./utils";

interface UsePHIDFieldProps {
  autoComplete: PHIDProps["autoComplete"];
  defaultValue?: string;
  value?: string;
  allowedScopes: PHIDProps["allowedScopes"];
  allowedDocumentTypes: PHIDProps["allowedDocumentTypes"];
  onChange?: PHIDProps["onChange"];
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

export function usePHIDField({
  autoComplete,
  defaultValue,
  value,
  allowedScopes,
  allowedDocumentTypes,
  onChange,
  onBlur,
}: UsePHIDFieldProps) {
  const isInternalChange = useRef(false);
  const optionsAbortControllerRef = useRef<AbortController | null>(null);
  const selectedOptionAbortControllerRef = useRef<AbortController | null>(null);
  const commandListRef = useRef<HTMLDivElement>(null);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [options, setOptions] = useState<PHIDListItemProps[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSelectedOption, setIsLoadingSelectedOption] = useState(false);
  const [haveFetchError, setHaveFetchError] = useState(false);
  const [selectedValue, setSelectedValue] = useState(
    value ?? defaultValue ?? "",
  );
  const [commandValue, setCommandValue] = useState("");
  const [haveBeenOpened, setHaveBeenOpened] = useState(false);

  const clear = useCallback(() => {
    optionsAbortControllerRef.current?.abort();
    selectedOptionAbortControllerRef.current?.abort();
    optionsAbortControllerRef.current = null;
    selectedOptionAbortControllerRef.current = null;
    setHaveFetchError(false);
    setIsLoading(false);
    setIsLoadingSelectedOption(false);
    setIsPopoverOpen(false);
  }, []);

  const debouncedFetchOptions = useDebounceCallback(
    useCallback(
      async (newValue: string) => {
        if (newValue === "") {
          clear();
          setOptions([]);
          setSelectedValue("");
          return;
        }

        optionsAbortControllerRef.current?.abort();
        const controller = new AbortController();
        optionsAbortControllerRef.current = controller;

        setHaveFetchError(false);
        setIsLoading(true);

        try {
          const newOptions = await fetchPHIDOptions({
            phidFragment: newValue,
            allowedScopes,
            allowedDocumentTypes,
            signal: controller.signal,
          });

          // Simulate 30% chance of error
          if (Math.random() < 0.3) {
            throw new Error("Simulated error");
          }

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
      [clear, allowedScopes, allowedDocumentTypes],
    ),
  );

  const handleFetchSelectedOption = useCallback(
    async (phid: string) => {
      selectedOptionAbortControllerRef.current?.abort();
      const controller = new AbortController();
      selectedOptionAbortControllerRef.current = controller;

      setIsLoadingSelectedOption(true);

      try {
        const selectedOption = await fetchSelectedOption({
          phid,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          if (selectedOption) {
            setOptions((prevOptions) => {
              const optionIndex = prevOptions.findIndex(
                (opt) => opt.phid === phid,
              );
              if (optionIndex !== -1) {
                const newOptions = [...prevOptions];
                newOptions[optionIndex] = selectedOption;
                return newOptions;
              }
              return prevOptions;
            });
          } else {
            clear();
            setOptions([]);
            setSelectedValue("");
          }
        }
      } catch (error) {
        console.error("Failed to fetch selected option: ", error);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSelectedOption(false);
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
      clear();
      onChange?.(optionValue);
    },
    [onChange, clear],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setSelectedValue(newValue);
      onChange?.(newValue);
    },
    [onChange],
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
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (autoComplete) {
      debouncedFetchOptions(selectedValue)?.catch((error) => {
        console.error("Failed to fetch options: ", error);
      });
    } else {
      clear();
      setOptions([]);
      setSelectedValue("");
    }
  }, [autoComplete, selectedValue, debouncedFetchOptions, clear]);

  useEffect(() => {
    if (isInternalChange.current) {
      console.log("isInternalChange.current", isInternalChange.current);
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
      optionsAbortControllerRef.current?.abort();
      selectedOptionAbortControllerRef.current?.abort();
    };
  }, []);

  return {
    selectedValue,
    isPopoverOpen,
    commandListRef,
    options,
    isLoading,
    isLoadingSelectedOption,
    haveFetchError,
    commandValue,
    toggleOption,
    handleOpenChange,
    onTriggerBlur,
    handleChange,
    handleCommandValue,
    handleFetchSelectedOption,
  };
}
