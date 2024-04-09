import { ComponentType } from 'react';
import { twJoin } from 'tailwind-merge';

type Input = {
    label: string;
    Input: ComponentType;
};
type Props = {
    inputs: Input[];
};
export function FormInputs(props: Props) {
    const { inputs } = props;
    return (
        <div className="bg-white text-xs font-medium">
            {inputs.map(({ label, Input }, index) => (
                <div
                    key={label}
                    className={twJoin(
                        'grid min-h-11 grid-cols-[208px,380px] items-center px-6 text-gray-600',
                        index % 2 !== 0 && 'bg-gray-50',
                    )}
                >
                    <div>{label}</div>
                    <div className="h-max py-2 text-gray-900" key={index}>
                        <Input />
                    </div>
                </div>
            ))}
        </div>
    );
}
