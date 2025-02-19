import * as React from "react";
import { forwardRef, useImperativeHandle, useRef, useCallback } from "react";
import { cn } from "../utils/style.js";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

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
        className={cn(
          "min-h-10 w-full resize-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={textareaRef}
        onInput={handleInput}
      />
    );
  },
);
Textarea.displayName = "Textarea";
