import React, { useCallback, useState, useEffect, useRef } from "react";
import { useDebounceCallback } from "usehooks-ts";
import type { AutocompleteProps, AutocompleteOption } from "./types";

interface UseAutocompleteFieldParams {
  autoComplete: AutocompleteProps["autoComplete"];
  defaultValue?: string;
  value?: string;
  isOpenByDefault: AutocompleteProps["isOpenByDefault"];
  initialOptions: AutocompleteProps["initialOptions"];
  onChange?: AutocompleteProps["onChange"];
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  fetchOptions: AutocompleteProps["fetchOptionsCallback"];
  fetchSelectedOption: AutocompleteProps["fetchSelectedOptionCallback"];
}

export function useAutocompleteField({
  autoComplete,
  defaultValue,
  value,
  isOpenByDefault,
  initialOptions,
  onChange,
  onBlur,
  fetchOptions,
  fetchSelectedOption,
}: UseAutocompleteFieldParams) {
  const shouldFetchOptions = useRef(false);
  const isInternalChange = useRef(false);
  const commandListRef = useRef<HTMLDivElement>(null);

  const [isPopoverOpen, setIsPopoverOpen] = useState(isOpenByDefault ?? false);
  const [options, setOptions] = useState<AutocompleteOption[]>(
    initialOptions ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSelectedOption, setIsLoadingSelectedOption] = useState(false);
  const [haveFetchError, setHaveFetchError] = useState(false);
  const [selectedValue, setSelectedValue] = useState(
    value ?? defaultValue ?? "",
  );
  const [selectedOption, setSelectedOption] = useState<
    AutocompleteOption | undefined
  >(undefined);
  const [commandValue, setCommandValue] = useState("");
  const [haveBeenOpened, setHaveBeenOpened] = useState(false);

  const clear = useCallback(() => {
    setHaveFetchError(false);
    setIsLoading(false);
    setIsLoadingSelectedOption(false);
    setIsPopoverOpen(false);
  }, []);

  const debouncedFetchOptions = useDebounceCallback(
    useCallback(
      (newValue: string) => {
        if (!autoComplete || !fetchOptions) return;
        if (newValue === "") {
          clear();
          setOptions([]);
          setSelectedValue("");
          setSelectedOption(undefined);
          return;
        }

        setHaveFetchError(false);
        setIsLoading(true);

        fetchOptions(newValue)
          .then((newOptions) => {
            setOptions(newOptions);
            const matchingOption = newOptions.find(
              (opt) => opt.value === newValue,
            );
            if (matchingOption) {
              setSelectedOption(matchingOption);
              setIsPopoverOpen(false);
            } else {
              setSelectedOption(undefined);
              setIsPopoverOpen(true);
            }
            setIsLoading(false);
          })
          .catch(() => {
            setHaveFetchError(true);
            setIsLoading(false);
          });
      },
      [clear, autoComplete, fetchOptions],
    ),
  );

  const handleFetchSelectedOption = useCallback(
    (value: string) => {
      if (!autoComplete || !fetchSelectedOption) return;

      setIsLoadingSelectedOption(true);

      fetchSelectedOption(value)
        .then((option) => {
          if (option) {
            setSelectedOption(option);
            setOptions((prevOptions) => {
              const optionIndex = prevOptions.findIndex(
                (opt) => opt.value === value,
              );
              if (optionIndex !== -1) {
                const newOptions = [...prevOptions];
                newOptions[optionIndex] = option;
                return newOptions;
              }
              return prevOptions;
            });
          } else {
            clear();
            setOptions([]);
            setSelectedValue("");
            setSelectedOption(undefined);
          }
          setIsLoadingSelectedOption(false);
        })
        .catch(() => {
          setIsLoadingSelectedOption(false);
        });
    },
    [clear, autoComplete, fetchSelectedOption],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setCommandValue(options[0]?.value ?? "");
      }
      setIsPopoverOpen(open);
    },
    [options],
  );

  const toggleOption = useCallback(
    (optionValue: string) => {
      shouldFetchOptions.current = false;
      isInternalChange.current = true;
      setSelectedValue(optionValue);
      setSelectedOption(options.find((opt) => opt.value === optionValue));
      clear();
      onChange?.(optionValue);
    },
    [onChange, clear, options],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      shouldFetchOptions.current = true;
      setSelectedValue(newValue);
      setSelectedOption(undefined);
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

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pastedValue = e.clipboardData.getData("text");
      if (pastedValue === selectedValue) {
        debouncedFetchOptions(selectedValue);
      }
    },
    [selectedValue, debouncedFetchOptions],
  );

  useEffect(() => {
    if (autoComplete) {
      if (shouldFetchOptions.current) {
        debouncedFetchOptions(selectedValue);
      }
    } else {
      clear();
      setOptions([]);
      setSelectedValue("");
      setSelectedOption(undefined);
    }
  }, [autoComplete, selectedValue, debouncedFetchOptions, clear]);

  useEffect(() => {
    if (!isInternalChange.current) {
      shouldFetchOptions.current = false;
      setSelectedValue(value ?? "");
      setSelectedOption(undefined);
    }
    isInternalChange.current = false;
  }, [value]);

  useEffect(() => {
    if (!isPopoverOpen && haveBeenOpened) {
      onBlur?.({ target: {} } as React.FocusEvent<HTMLInputElement>);
    }

    if (isPopoverOpen) {
      setHaveBeenOpened(true);
    }
  }, [isPopoverOpen, haveBeenOpened, onBlur]);

  // added to support the Filled variant in stories
  useEffect(() => {
    if (initialOptions?.length && selectedValue) {
      const matchingOption = initialOptions.find(
        (opt) => opt.value === selectedValue,
      );
      if (matchingOption) {
        setSelectedOption(matchingOption);
      }
    }
  }, []);

  return {
    selectedValue,
    selectedOption,
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
    handlePaste,
  };
}
