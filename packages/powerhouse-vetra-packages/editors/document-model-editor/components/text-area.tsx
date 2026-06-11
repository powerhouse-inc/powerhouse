import * as React from "react";
import { forwardRef, useImperativeHandle, useRef, useCallback } from "react";
import { twMerge } from "tailwind-merge";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export interface TextareaHandle {
  focus: () => void;
  element: HTMLTextAreaElement | null;
}

export const Textarea = forwardRef<TextareaHandle, TextareaProps>(
  ({ className, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = useCallback((textarea: HTMLTextAreaElement) => {
      textarea.style.height = "auto";
      const newHeight = Math.max(textarea.scrollHeight, textarea.offsetHeight);
      textarea.style.height = `${newHeight}px`;
    }, []);

    const handleInput = useCallback(
      (e: React.FormEvent<HTMLTextAreaElement>) => {
        adjustHeight(e.currentTarget);
      },
      [adjustHeight],
    );

    React.useEffect(() => {
      if (textareaRef.current) {
        adjustHeight(textareaRef.current);
      }
    }, [adjustHeight]);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      element: textareaRef.current,
    }));

    return (
      <textarea
        {...props}
        className={twMerge(
          "min-h-10 w-full resize-none rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100 dark:placeholder:text-slate-300",
          className,
        )}
        ref={textareaRef}
        onInput={handleInput}
      />
    );
  },
);
Textarea.displayName = "Textarea";
