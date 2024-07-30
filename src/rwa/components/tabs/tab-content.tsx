import { ReactNode } from 'react';

type Props = {
    label: ReactNode;
    description: ReactNode;
    children: ReactNode;
};
export function TabContent(props: Props) {
    const { label, description, children } = props;

    return (
        <div>
            <h1 className="mb-2 text-lg font-bold">{label}</h1>
            <p className="mb-4 text-xs text-gray-600">{description}</p>
            {children}
        </div>
    );
}
