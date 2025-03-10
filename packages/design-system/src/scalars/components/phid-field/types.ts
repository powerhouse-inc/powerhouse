import type { IconName } from "#powerhouse";

export interface PHIDBaseProps {
  onChange?: (value: string) => void;
  placeholder?: string;
  allowedScopes?: string[];
  allowUris?: boolean;
  allowDataObjectReference?: boolean;
  maxLength?: number;
  isOpenByDefault?: boolean;
  initialOptions?: PHIDItem[];
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
        fetchOptionsCallback: (phidFragment: string) => Promise<PHIDItem[]>;
        fetchSelectedOptionCallback?: (
          phid: string,
        ) => Promise<PHIDItem | undefined>;
      }
  );

export interface PHIDItem {
  icon?: IconName | React.ReactElement;
  title?: string;
  path?: string;
  phid: string;
  description?: string;
}
