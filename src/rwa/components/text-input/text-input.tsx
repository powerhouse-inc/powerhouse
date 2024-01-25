import { TextInput, TextInputProps, mergeClassNameProps } from '@/powerhouse';
import React from 'react';

export interface RWATextInputProps extends TextInputProps {
    label?: string;
}

export const RWATextInput: React.FC<RWATextInputProps> = props => {
    const { label, ...textInputProps } = props;
    return (
        <div>
            {label && (
                <span className="pb-2 text-xs text-gray-600">{label}</span>
            )}
            <TextInput
                {...mergeClassNameProps(
                    textInputProps,
                    'h-[42px] rounded-xl bg-gray-100 px-3 text-xs',
                )}
            />
        </div>
    );
};
