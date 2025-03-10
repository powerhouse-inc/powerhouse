import { Button, Icon } from "#powerhouse";
import { SettingsRow, type SettingsRowProps } from "./row";

export interface ClearStorageSettingsRowProps extends SettingsRowProps {
  onClearStorage: () => void;
  buttonLabel: string;
}

export const ClearStorageSettingsRow: React.FC<ClearStorageSettingsRowProps> = (
  props,
) => {
  const { onClearStorage, buttonLabel, ...restProps } = props;

  return (
    <SettingsRow {...restProps}>
      <Button
        className="h-auto min-h-9 rounded border border-solid border-gray-300 bg-white px-3 py-0 text-sm text-red-800 hover:border-gray-500 hover:bg-white hover:text-red-900"
        icon={<Icon name="Trash" size={18} />}
        iconPosition="right"
        onClick={onClearStorage}
      >
        {buttonLabel}
      </Button>
    </SettingsRow>
  );
};
