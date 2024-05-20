import { ComponentType } from 'react';

type Input = {
    label: string;
    Input: ComponentType;
};
type Props = {
    inputs: Input[];
};
export function ModalFormInputs(props: Props) {
    const { inputs } = props;
    return (
        <div className="bg-white text-xs font-medium">
            {inputs.map(({ label, Input }, index) => (
                <div key={label} className="mb-4 mt-2 grid gap-1">
                    <label className="text-base">{label}</label>
                    <div key={index}>
                        <Input />
                    </div>
                </div>
            ))}
        </div>
    );
}
