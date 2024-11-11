import * as React from "react";
import { cn } from "../utils";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export interface TextareaHandle {
  focus: () => void;
  element: HTMLTextAreaElement | null;
}

export const Textarea = forwardRef<TextareaHandle, TextareaProps>(
  ({ className, value, onInput, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      element: textareaRef.current,
    }));

    const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      onInput?.(e);
    };

    useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    }, [value]);

    return (
      <textarea
        {...props}
        className={cn(
          "w-full resize-none rounded-md border border-gray-200 bg-transparent px-3 pb-[10px] pt-2 text-sm text-gray-800 placeholder:text-gray-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={textareaRef}
        onInput={handleInput}
        value={value}
      />
    );
  },
);
Textarea.displayName = "Textarea";
