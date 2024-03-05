import { Button, Icon } from '@/powerhouse';
import { SettingsRow, SettingsRowProps } from './row';

export interface ClearStorageSettingsRowProps extends SettingsRowProps {
    onClearStorage: () => void;
    buttonLabel: string;
}

export const ClearStorageSettingsRow: React.FC<
    ClearStorageSettingsRowProps
> = props => {
    const { onClearStorage, buttonLabel, ...restProps } = props;

    return (
        <SettingsRow {...restProps}>
            <Button
                onClick={onClearStorage}
                iconPosition="right"
                icon={<Icon name="trash" size={18} />}
                className="h-auto min-h-9 rounded border border-solid border-gray-300 bg-white p-0 px-3 text-sm text-red-800 hover:border-gray-500 hover:bg-white hover:text-red-900"
            >
                {buttonLabel}
            </Button>
        </SettingsRow>
    );
};
