import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounceCallback } from "usehooks-ts";
import { useIdAutocompleteContext } from "./id-autocomplete-context.js";
import type { IdAutocompleteOption, IdAutocompleteProps } from "./types.js";

interface UseIdAutocompleteFieldParams {
  autoComplete: IdAutocompleteProps["autoComplete"];
  defaultValue?: string;
  value?: string;
  isOpenByDefault: IdAutocompleteProps["isOpenByDefault"];
  initialOptions: IdAutocompleteProps["initialOptions"];
  onChange?: IdAutocompleteProps["onChange"];
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  fetchOptions: IdAutocompleteProps["fetchOptionsCallback"];
  fetchSelectedOption: IdAutocompleteProps["fetchSelectedOptionCallback"];
}

export function useIdAutocompleteField({
  autoComplete,
  defaultValue,
  value,
  isOpenByDefault,
  initialOptions,
  onChange,
  onBlur,
  fetchOptions,
  fetchSelectedOption,
}: UseIdAutocompleteFieldParams) {
  const context = useIdAutocompleteContext();
  const shouldFetchOptions = useRef(false);
  const isInternalChange = useRef(false);
  const commandListRef = useRef<HTMLDivElement>(null);

  const [isPopoverOpen, setIsPopoverOpen] = useState(isOpenByDefault ?? false);
  const [options, setOptions] = useState<IdAutocompleteOption[]>(
    initialOptions ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSelectedOption, setIsLoadingSelectedOption] = useState(false);
  const [haveFetchError, setHaveFetchError] = useState(false);
  const [selectedValue, setSelectedValue] = useState(
    value ?? defaultValue ?? "",
  );
  const [selectedOption, setSelectedOption] = useState<
    IdAutocompleteOption | undefined
  >(undefined);
  const [commandValue, setCommandValue] = useState("");
  const [isFetchSelectedOptionSync, setIsFetchSelectedOptionSync] =
    useState(false);

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

        try {
          const result = fetchOptions(newValue, context);
          Promise.resolve(result)
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
        } catch {
          setHaveFetchError(true);
          setIsLoading(false);
        }
      },
      [clear, autoComplete, fetchOptions, context],
    ),
  );

  const handleFetchSelectedOption = useCallback(
    (value: string) => {
      if (!autoComplete || !fetchSelectedOption) return;

      setIsLoadingSelectedOption(true);

      try {
        const result = fetchSelectedOption(value);
        const isPromise = result instanceof Promise;

        Promise.resolve(result)
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
            if (!isPromise) {
              setIsFetchSelectedOptionSync(true);
              setTimeout(() => {
                setIsFetchSelectedOptionSync(false);
              }, 1500);
            }
          })
          .catch(() => {
            setIsLoadingSelectedOption(false);
          });
      } catch {
        setIsLoadingSelectedOption(false);
      }
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
    isFetchSelectedOptionSync,
    toggleOption,
    handleOpenChange,
    onTriggerBlur,
    handleChange,
    handleCommandValue,
    handleFetchSelectedOption,
    handlePaste,
  };
}
