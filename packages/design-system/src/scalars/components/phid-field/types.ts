import React from "react";

export interface PHIDProps {
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  autoComplete?: React.HTMLInputAutoCompleteAttribute;
  placeholder?: string;
  defaultBranch?: string;
  defaultScope?: string;
  allowedScopes?: string[];
  allowedDocumentTypes?: string[];
  allowUris?: boolean;
  enableAutoComplete?: boolean;
  allowDataObjectReference?: boolean;
  selectedOptionVariant?: "withPHID" | "withTitle" | "withTitleAndDescription";
  minLength?: number;
  maxLength?: number;
}
