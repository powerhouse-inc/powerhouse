import React from "react";

export interface PHIDProps {
  onChange?: (value: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  placeholder?: string;
  defaultBranch?: string;
  defaultScope?: string;
  allowedScopes?: string[];
  allowedDocumentTypes?: string[];
  allowUris?: boolean;
  autoComplete?: boolean;
  allowDataObjectReference?: boolean;
  variant?: "withId" | "withIdAndTitle" | "withIdTitleAndDescription";
  minLength?: number;
  maxLength?: number;
}

export interface PHIDListItemProps {
  title?: string;
  path?: string;
  phid: string;
  description?: string;
}
