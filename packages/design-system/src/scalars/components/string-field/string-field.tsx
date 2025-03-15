import React from "react";
import {
  TextField,
  type TextFieldProps,
} from "../fragments/text-field/index.js";
import { Textarea, type TextareaProps } from "../fragments/textarea-field/index.js";

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
      <Textarea
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
