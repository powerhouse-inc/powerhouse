export interface PHIDBaseProps {
  onChange?: (value: string) => void;
  placeholder?: string;
  defaultBranch?: string;
  defaultScope?: string;
  allowedScopes?: string[];
  allowedDocumentTypes?: string[];
  allowUris?: boolean;
  allowDataObjectReference?: boolean;
  maxLength?: number;
}

export type PHIDProps = PHIDBaseProps &
  (
    | {
        autoComplete: false;
        variant?: never;
        fetchOptionsCallback?: never;
        fetchSelectedOptionCallback?: never;
      }
    | {
        autoComplete?: true;
        variant?: "withId" | "withIdAndTitle" | "withIdTitleAndDescription";
        fetchOptionsCallback?: (phidFragment: string) => Promise<PHIDItem[]>;
        fetchSelectedOptionCallback?: (
          phid: string,
        ) => Promise<PHIDItem | undefined>;
      }
  );

export interface PHIDItem {
  title?: string;
  path?: string;
  phid: string;
  description?: string;
}
