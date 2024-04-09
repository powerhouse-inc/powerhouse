import { RWASelect, RWASelectProps } from '@/rwa';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';

export interface RWATableSelectProps<ControlInputs extends FieldValues>
    extends RWASelectProps {
    disabled?: boolean;
    name: Path<ControlInputs>;
    control: Control<ControlInputs>;
    required?: boolean;
}

export function RWATableSelect<ControlInputs extends FieldValues>(
    props: RWATableSelectProps<ControlInputs>,
) {
    const {
        name,
        control,
        required = false,
        disabled = false,
        ...restProps
    } = props;

    return (
        <Controller
            name={name}
            control={control}
            rules={{ required }}
            render={({ field: { onChange, onBlur, value } }) => (
                <RWASelect
                    onBlur={onBlur}
                    selectedKey={value}
                    isDisabled={disabled}
                    onSelectionChange={onChange}
                    {...restProps}
                />
            )}
        />
    );
}
