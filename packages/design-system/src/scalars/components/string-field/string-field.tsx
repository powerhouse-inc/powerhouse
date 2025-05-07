import React from "react";
import {
  TextField,
  type TextFieldProps,
} from "../fragments/text-field/index.js";
import {
  TextareaField,
  type TextareaFieldProps,
} from "../fragments/textarea-field/index.js";
import { type DiffMode, type WithDifference } from "../types.js";

export interface StringFieldProps
  extends Omit<TextFieldProps, keyof TextareaFieldProps>,
    TextareaFieldProps,
    Omit<WithDifference<string>, "diffMode"> {
  diffModeWords?: Extract<DiffMode, "words">;
  diffModeSentences?: Extract<DiffMode, "sentences">;
}

export const StringField = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  StringFieldProps
>(
  (
    { autoExpand, multiline, diffModeWords, diffModeSentences, ...props },
    ref,
  ) => {
    if (autoExpand || multiline) {
      // only textarea supports autoExpand and multiline
      return (
        <TextareaField
          autoExpand={autoExpand}
          multiline={multiline}
          diffMode={diffModeWords}
          {...(props as TextareaFieldProps)}
          ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
        />
      );
    }

    return (
      <TextField
        diffMode={diffModeSentences}
        {...(props as TextFieldProps)}
        ref={ref as React.ForwardedRef<HTMLInputElement>}
      />
    );
  },
);

StringField.displayName = "StringField";
