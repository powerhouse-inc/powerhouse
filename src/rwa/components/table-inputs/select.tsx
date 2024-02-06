import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { RWASelect, RWASelectProps } from '../select';

export interface RWATableSelectProps<ControlInputs extends FieldValues>
    extends RWASelectProps {
    disabled?: boolean;
    name: Path<ControlInputs>;
    control: Control<ControlInputs>;
}

export function RWATableSelect<ControlInputs extends FieldValues>(
    props: RWATableSelectProps<ControlInputs>,
) {
    const { name, control, disabled = false, ...restProps } = props;

    return (
        <Controller
            name={name}
            control={control}
            render={({ field: { onChange, onBlur, value } }) => (
                <RWASelect
                    onBlur={onBlur}
                    selectedKey={value}
                    isDisabled={disabled}
                    onSelectionChange={onChange}
                    buttonProps={{
                        className: twMerge(
                            'h-[32px] rounded-md',
                            disabled &&
                                'bg-white p-0 [&>span:last-child]:hidden ',
                        ),
                    }}
                    {...restProps}
                />
            )}
        />
    );
}
