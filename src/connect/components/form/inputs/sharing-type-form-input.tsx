import { Select, SharingType, sharingTypeOptions } from '@/connect';
import { ComponentPropsWithRef } from 'react';
import { Control, Controller, Path } from 'react-hook-form';

type SharingTypeFormInputProps<T extends { sharingType: SharingType }> = Omit<
    ComponentPropsWithRef<typeof Select>,
    'id' | 'items' | 'value' | 'onChange'
> & {
    control: Control<T>;
};
export function SharingTypeFormInput<T extends { sharingType: SharingType }>(
    props: SharingTypeFormInputProps<T>,
) {
    const { control, ...delegatedProps } = props;

    return (
        <Controller
            name={'sharingType' as Path<T>}
            control={control}
            render={({ field }) => (
                <Select
                    {...delegatedProps}
                    {...field}
                    id="sharingType"
                    items={sharingTypeOptions}
                />
            )}
        />
    );
}
