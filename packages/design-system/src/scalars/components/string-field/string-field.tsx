import React from "react";
import { TextField, type TextFieldProps } from "../fragments/text-field";
import { TextareaField, type TextareaProps } from "../fragments/textarea-field";

export interface StringFieldProps
  extends Omit<TextFieldProps, keyof TextareaProps>,
    TextareaProps {}

export const StringField = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  StringFieldProps
>(({ autoExpand, multiline, ...props }, ref) => {
  if (autoExpand || multiline) {
    // only textarea supports autoExpand and multiline
    return (
      <TextareaField
        autoExpand={autoExpand}
        multiline={multiline}
        {...(props as TextareaProps)}
        ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
      />
    );
  }

  return (
    <TextField
      {...(props as TextFieldProps)}
      ref={ref as React.ForwardedRef<HTMLInputElement>}
    />
  );
});

StringField.displayName = "StringField";
