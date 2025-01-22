import React from "react";

export interface PHIDBaseProps {
  onChange?: (value: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  placeholder?: string;
  defaultBranch?: string;
  defaultScope?: string;
  allowedScopes?: string[];
  allowedDocumentTypes?: string[];
  allowUris?: boolean;
  allowDataObjectReference?: boolean;
  minLength?: number;
  maxLength?: number;
}

export type PHIDProps = PHIDBaseProps &
  (
    | { autoComplete?: false; variant: undefined }
    | {
        autoComplete: true;
        variant?: "withId" | "withIdAndTitle" | "withIdTitleAndDescription";
      }
  );

export interface PHIDListItemProps {
  title?: string;
  path?: string;
  phid: string;
  description?: string;
}
